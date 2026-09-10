import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, NotificationEvent, type Prisma, SchoolInvoiceStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { CasesService } from '../cases/cases.service.js';
import { CaseDocumentsService } from '../documents/case-documents.service.js';
import { FxService } from '../fx/fx.service.js';
import { VISA_TYPE_LABELS } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { VisaService } from '../visa/visa.service.js';
import type { CreateInvitationDto, CreateSchoolInvoiceDto, UpdateSchoolInvoiceDto } from './dto/school-invoice.dto.js';

const INVOICE_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  case: { select: { id: true, code: true, userId: true, university: { select: { id: true, nameMn: true } } } },
} satisfies Prisma.SchoolInvoiceInclude;

/**
 * 1E-06/1E-08/1E-09 — the school's won-denominated bill, the transfer service
 * GKS sells around it, and the invitation letter that ends the admission phase.
 *
 * The MNT figure is computed once at issue time from that day's rate and stored
 * (§8): a rate move tomorrow must not change what the client was told to pay.
 */
@Injectable()
export class SchoolInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly fx: FxService,
    private readonly cases: CasesService,
    private readonly documents: CaseDocumentsService,
    private readonly visa: VisaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Invoices ───────────────────────────────────────────────────────────────

  async findForCase(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    return this.prisma.schoolInvoice.findMany({ where: { caseId }, include: INVOICE_INCLUDE, orderBy: { createdAt: 'desc' } });
  }

  async create(caseId: string, dto: CreateSchoolInvoiceDto, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);

    const totalKrw = dto.items.reduce((sum, item) => sum + item.amountKrw, 0);
    if (totalKrw <= 0) throw new BadRequestException('Нэхэмжлэхийн дүн 0-ээс их байх ёстой');

    const fxRate = dto.fxRate ?? (await this.fx.current()).rate;
    const transferFeeMnt = dto.transferFeeMnt ?? 0;

    const invoice = await this.prisma.schoolInvoice.create({
      data: {
        caseId,
        status: SchoolInvoiceStatus.ISSUED,
        totalKrw,
        fxRate,
        // Rounded to whole tögrög — this is the figure the client transfers.
        amountMnt: Math.round(totalKrw * fxRate),
        transferFeeMnt,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        note: dto.note,
        items: {
          create: dto.items.map((item, index) => ({
            kind: item.kind,
            labelMn: item.labelMn,
            amountKrw: item.amountKrw,
            sortOrder: index,
          })),
        },
      },
      include: INVOICE_INCLUDE,
    });

    await this.cases.applyDomainTransition(caseId, CaseStage.TUITION_INVOICED, actor.id, 'Сургуулийн төлбөрийн нэхэмжлэх бүртгэгдсэн');
    return invoice;
  }

  async update(id: string, dto: UpdateSchoolInvoiceDto, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    await this.documents.assertCaseAccess(invoice.caseId, actor);

    return this.prisma.schoolInvoice.update({
      where: { id },
      data: {
        status: dto.status,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        receivedBySchoolAt: dto.receivedBySchoolAt ? new Date(dto.receivedBySchoolAt) : undefined,
        note: dto.note,
      },
      include: INVOICE_INCLUDE,
    });
  }

  /** The transfer receipt (§8 "төлсөн баримт"). */
  async attachReceipt(id: string, buffer: Buffer, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    await this.documents.assertCaseAccess(invoice.caseId, actor);

    const { path } = await this.storage.upload({ caseId: invoice.caseId, docCode: 'school-invoice', buffer });
    return this.prisma.schoolInvoice.update({
      where: { id },
      data: { receiptPath: path, status: SchoolInvoiceStatus.PAID, paidAt: invoice.paidAt ?? new Date() },
      include: INVOICE_INCLUDE,
    });
  }

  async receiptUrl(id: string, actor: AuthenticatedUser) {
    const invoice = await this.getOrThrow(id);
    await this.documents.assertCaseAccess(invoice.caseId, actor);
    if (!invoice.receiptPath) throw new NotFoundException('Энэ нэхэмжлэх дээр баримт хавсаргаагүй байна');
    return this.storage.sign(invoice.receiptPath);
  }

  // ─── Invitation (1E-09) ─────────────────────────────────────────────────────

  async invitationForCase(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    return this.prisma.invitation.findUnique({ where: { caseId } });
  }

  /**
   * Recording the invitation is what opens the visa phase: the case advances
   * and `VisaService.openForCase` materialises the `stage = VISA` checklist
   * from the same rule engine (§8 → §10).
   */
  async recordInvitation(caseId: string, dto: CreateInvitationDto, buffer: Buffer | undefined, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);

    const filePath = buffer
      ? (await this.storage.upload({ caseId, docCode: 'invitation', buffer })).path
      : undefined;

    // Whether this is the first record decides whether the client hears about
    // it: re-recording an invitation to fix a typo used to re-send both the
    // invitation and the "visa stage started" email *and* SMS (1N-26).
    const known = await this.prisma.invitation.findUnique({ where: { caseId }, select: { id: true } });

    const invitation = await this.prisma.invitation.upsert({
      where: { caseId },
      create: {
        caseId,
        number: dto.number,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
        note: dto.note,
        filePath,
        uploadedById: actor.id,
      },
      update: {
        number: dto.number,
        issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
        note: dto.note,
        filePath: filePath ?? undefined,
        uploadedById: actor.id,
      },
    });

    await this.cases.applyDomainTransition(caseId, CaseStage.INVITATION_RECEIVED, actor.id, 'Сургуулийн урилга ирсэн');
    const visa = await this.visa.openForCase(caseId);

    // §16 "Урилга ирсэн" + "Визний үе шат эхэлсэн" — one action, two events,
    // because the visa checklist has just appeared in the client's cabinet.
    if (!known) {
      await this.notifications.dispatchForCase(caseId, NotificationEvent.INVITATION_RECEIVED, {
        invitationNumber: invitation.number,
      });
      await this.notifications.dispatchForCase(caseId, NotificationEvent.VISA_STAGE_STARTED, {
        invitationNumber: invitation.number,
        visaTypeName: VISA_TYPE_LABELS[visa.visaCase.visaType],
      });
    }

    return { invitation, visa };
  }

  async invitationUrl(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    const invitation = await this.prisma.invitation.findUnique({ where: { caseId } });
    if (!invitation?.filePath) throw new NotFoundException('Урилгын файл байхгүй байна');
    return this.storage.sign(invitation.filePath);
  }

  private async getOrThrow(id: string) {
    const invoice = await this.prisma.schoolInvoice.findUnique({ where: { id } });
    if (!invoice) throw new NotFoundException(`Нэхэмжлэх ${id} олдсонгүй`);
    return invoice;
  }
}
