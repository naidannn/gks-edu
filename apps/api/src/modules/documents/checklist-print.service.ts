import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { DocStage } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';
import { CaseDocumentsService } from './case-documents.service.js';
import {
  ChecklistPdfService,
  checklistFilename,
  formatDeadlineMn,
  type ChecklistPdfParams,
} from './checklist-pdf.service.js';

/**
 * 1D-21 — gathers everything the printed checklist names and hands it to the
 * renderer. Kept apart from `CaseDocumentsService` because it reads across the
 * case (client, school, intake, officer) rather than the paperwork alone.
 */
@Injectable()
export class ChecklistPrintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: CaseDocumentsService,
    private readonly pdf: ChecklistPdfService,
  ) {}

  /** Staff print it for the desk; the client may print their own (§11). */
  async render(caseId: string, stage: DocStage, actor: AuthenticatedUser): Promise<{ buffer: Buffer; filename: string }> {
    await this.documents.assertCaseAccess(caseId, actor);
    const params = await this.collect(caseId, stage);
    const buffer = await this.pdf.render(params);
    return { buffer, filename: checklistFilename(params.caseCode, stage) };
  }

  private async collect(caseId: string, stage: DocStage): Promise<ChecklistPdfParams> {
    const [gksCase, documents] = await Promise.all([
      this.prisma.case.findUnique({
        where: { id: caseId },
        select: {
          code: true,
          serviceType: true,
          user: { select: { name: true, client: { select: { code: true, lastName: true, firstName: true, phone: true } } } },
          university: { select: { nameMn: true } },
          program: { select: { nameMn: true } },
          intake: { select: { year: true, month: true, internalDeadline: true } },
          assignedDocOfficer: { select: { name: true, phone: true } },
        },
      }),
      this.prisma.caseDocument.findMany({
        where: { caseId, stage, deletedAt: null },
        include: { template: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    if (!gksCase) throw new NotFoundException(`Case ${caseId} not found`);

    const client = gksCase.user.client;
    return {
      stage,
      caseCode: gksCase.code,
      clientName: client ? `${client.lastName} ${client.firstName}` : (gksCase.user.name ?? '—'),
      clientCode: client?.code ?? null,
      clientPhone: client?.phone ?? null,
      serviceName: SERVICE_TYPE_LABELS[gksCase.serviceType],
      universityName: gksCase.university?.nameMn ?? null,
      programName: gksCase.program?.nameMn ?? null,
      intakeLabel: gksCase.intake ? `${gksCase.intake.year} оны ${gksCase.intake.month}-р сарын элсэлт` : null,
      // The school's own deadline is never printed: given two dates people work
      // to the later one, so the sheet carries ours alone (CLAUDE.md).
      deadlineLabel: gksCase.intake?.internalDeadline ? formatDeadlineMn(gksCase.intake.internalDeadline) : null,
      officerName: gksCase.assignedDocOfficer?.name ?? null,
      officerPhone: gksCase.assignedDocOfficer?.phone ?? null,
      printedAt: new Date(),
      documents: documents.map((row) => ({
        nameMn: row.template.nameMn,
        descriptionMn: row.template.descriptionMn,
        sourceHint: row.template.sourceHint,
        issuerHint: row.template.issuerHint,
        needsTranslation: row.template.needsTranslation,
        needsNotary: row.template.needsNotary,
        needsApostille: row.template.needsApostille,
        needsPhysicalOriginal: row.template.needsPhysicalOriginal,
        necessity: row.necessity,
        status: row.status,
        conditionNote: row.conditionNote,
        dueAt: row.dueAt,
      })),
    };
  }
}
