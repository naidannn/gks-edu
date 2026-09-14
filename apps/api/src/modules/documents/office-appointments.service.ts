import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppointmentStatus, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CaseDocumentsService } from './case-documents.service.js';
import { SETTLED_STATUSES } from './document-status.js';
import type {
  CreateOfficeAppointmentDto,
  QueryOfficeAppointmentsDto,
  UpdateOfficeAppointmentDto,
} from './dto/office-appointment.dto.js';

/** Case, client and phone — what the desk needs to recognise whoever walks in. */
const DESK_INCLUDE = {
  case: {
    select: {
      id: true,
      code: true,
      serviceType: true,
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
} satisfies Prisma.OfficeAppointmentInclude;

/**
 * 1D-11 — the single office visit. gksedu.md §17.5 names "coming to the office
 * several times" as a problem to solve, so a case may hold only one open
 * booking: everything marked "эх хувиар авчрах" is handed over at once.
 */
@Injectable()
export class OfficeAppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: CaseDocumentsService,
  ) {}

  async findForCase(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    const [appointments, pending] = await Promise.all([
      this.prisma.officeAppointment.findMany({ where: { caseId }, orderBy: { scheduledAt: 'desc' } }),
      this.documents.physicalOriginals(caseId, actor),
    ]);
    return { appointments, physicalOriginals: pending };
  }

  /**
   * 1D-25 — the front-office day sheet.
   *
   * Booking lived only in the client's cabinet, so the people the client was
   * coming to see could not see them coming. Each row carries how many of the
   * originals are still outstanding, because that is what the visit is for:
   * a visit with nothing left to hand over is one to cancel, not to staff.
   */
  async findUpcoming(query: QueryOfficeAppointmentsDto) {
    const where: Prisma.OfficeAppointmentWhereInput = {
      status: query.status ?? AppointmentStatus.SCHEDULED,
      scheduledAt: {
        gte: query.from ? new Date(query.from) : new Date(),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      },
    };

    const appointments = await this.prisma.officeAppointment.findMany({
      where,
      include: DESK_INCLUDE,
      orderBy: { scheduledAt: 'asc' },
      take: 100,
    });
    if (!appointments.length) return [];

    // One query for every visit on the sheet rather than one per row: the
    // database is 115 ms away and the day sheet is opened all morning.
    const originals = await this.prisma.caseDocument.groupBy({
      by: ['caseId'],
      where: {
        caseId: { in: appointments.map((row) => row.caseId) },
        deletedAt: null,
        template: { needsPhysicalOriginal: true },
        receivedAt: null,
        status: { notIn: [...SETTLED_STATUSES] },
      },
      _count: { _all: true },
    });
    const outstanding = new Map(originals.map((row) => [row.caseId, row._count._all]));

    return appointments.map((row) => ({ ...row, outstandingOriginals: outstanding.get(row.caseId) ?? 0 }));
  }

  async create(caseId: string, dto: CreateOfficeAppointmentDto, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);

    const open = await this.prisma.officeAppointment.findFirst({
      where: { caseId, status: AppointmentStatus.SCHEDULED },
    });
    if (open) throw new BadRequestException('Энэ үйлчилгээнд товлогдсон уулзалт аль хэдийн байна');

    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() < Date.now()) throw new BadRequestException('Өнгөрсөн цагт товлох боломжгүй');

    return this.prisma.officeAppointment.create({
      data: { caseId, scheduledAt, note: dto.note, createdById: actor.id },
    });
  }

  async update(id: string, dto: UpdateOfficeAppointmentDto, actor: AuthenticatedUser) {
    const appointment = await this.prisma.officeAppointment.findUnique({ where: { id } });
    if (!appointment) throw new NotFoundException(`Товлолт ${id} олдсонгүй`);
    await this.documents.assertCaseAccess(appointment.caseId, actor);

    // Closing a visit out is the desk's verdict on whether somebody turned up,
    // so it is staff work; a client may move their own booking or drop it.
    if (dto.status && !isStaff(actor.role) && dto.status !== AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Уулзалтын үр дүнг зөвхөн ажилтан бүртгэнэ');
    }
    if (dto.scheduledAt && new Date(dto.scheduledAt).getTime() < Date.now() && !isStaff(actor.role)) {
      throw new BadRequestException('Өнгөрсөн цагт товлох боломжгүй');
    }

    return this.prisma.officeAppointment.update({
      where: { id },
      data: {
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        status: dto.status,
        note: dto.note,
      },
    });
  }
}
