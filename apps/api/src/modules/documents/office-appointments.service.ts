import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppointmentStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CaseDocumentsService } from './case-documents.service.js';
import type { CreateOfficeAppointmentDto, UpdateOfficeAppointmentDto } from './dto/office-appointment.dto.js';

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

  async create(caseId: string, dto: CreateOfficeAppointmentDto, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);

    const open = await this.prisma.officeAppointment.findFirst({
      where: { caseId, status: AppointmentStatus.SCHEDULED },
    });
    if (open) throw new BadRequestException('Энэ хэрэг дээр товлогдсон уулзалт аль хэдийн байна');

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
