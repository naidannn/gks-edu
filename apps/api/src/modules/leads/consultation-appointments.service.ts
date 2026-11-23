import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OFFICE, OFFICE_UTC_OFFSET, officeBlockProblem, officeClock, pad } from '../../common/office-hours.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppointmentStatus, ConsultationMode, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateConsultationAppointmentDto,
  QueryConsultationCalendarDto,
  UpdateConsultationAppointmentDto,
} from './dto/consultation-appointment.dto.js';

const DEFAULT_DURATION = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Six weeks covers a month view with its spill-over days; anything wider is a report, not a calendar. */
const MAX_RANGE_DAYS = 42;

const CALENDAR_INCLUDE = {
  staff: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  client: { select: { id: true, code: true } },
} satisfies Prisma.ConsultationAppointmentInclude;

/** What the assistant agreed with somebody, in the office's own terms. */
export interface AssistantBooking {
  /** The enquiry the chat filed, or the one a signed-in client came from. */
  leadId: string | null;
  clientId?: string | null;
  /** Falls back to the lead's or client's own name and number. */
  name?: string | null;
  phone?: string | null;
  /** `YYYY-MM-DD`, Ulaanbaatar — already checked against the office's week. */
  date: string;
  /** `HH:MM`, or absent: "any time we are open that day". */
  time?: string;
  mode?: ConsultationMode;
  note?: string;
}

/**
 * 1B-30 — the consultation calendar.
 *
 * Two writers share one table: the assistant, which books the time it agreed
 * in chat, and staff, who add the people who phoned or walked in. Every block
 * has to sit inside the office's week (`common/office-hours.ts`) — the business
 * made Saturday and Sunday full days off on 2026-11-23, and a booking the
 * office would not be in for is worse than none.
 */
@Injectable()
export class ConsultationAppointmentsService {
  private readonly logger = new Logger(ConsultationAppointmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everything booked in `[from, to)`: consultations of every status (the page
   * decides what to hide), plus the clients' office visits for originals
   * (1D-11) — the desk needs to see everybody who is coming, not one kind.
   */
  async calendar(query: QueryConsultationCalendarDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to.getTime() <= from.getTime()) throw new BadRequestException('Хугацааны муж буруу байна');
    if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
      throw new BadRequestException(`Нэг удаад ${MAX_RANGE_DAYS} хоногоос ихгүй хугацааг харна`);
    }

    // Read-only, so Promise.all rather than $transaction (CLAUDE.md rule 9).
    const [appointments, visits] = await Promise.all([
      this.prisma.consultationAppointment.findMany({
        where: { startsAt: { gte: from, lt: to } },
        include: CALENDAR_INCLUDE,
        orderBy: { startsAt: 'asc' },
      }),
      this.prisma.officeAppointment.findMany({
        where: { scheduledAt: { gte: from, lt: to }, status: { not: AppointmentStatus.CANCELLED } },
        include: { case: { select: { id: true, code: true, user: { select: { name: true, phone: true } } } } },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    return {
      hours: OFFICE.hours,
      appointments,
      officeVisits: visits.map((visit) => ({
        id: visit.id,
        scheduledAt: visit.scheduledAt,
        status: visit.status,
        note: visit.note,
        caseId: visit.case.id,
        caseCode: visit.case.code,
        name: visit.case.user.name,
        phone: visit.case.user.phone,
      })),
    };
  }

  async create(dto: CreateConsultationAppointmentDto, actor: AuthenticatedUser) {
    const startsAt = new Date(dto.startsAt);
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION;
    this.assertInsideOffice(startsAt, durationMinutes);

    const person = await this.resolvePerson(dto.leadId ?? null, dto.clientId ?? null);
    if (dto.staffId) await this.assertStaffFree(dto.staffId, startsAt, durationMinutes, null);

    return this.prisma.consultationAppointment.create({
      data: {
        startsAt,
        durationMinutes,
        mode: dto.mode ?? ConsultationMode.OFFICE,
        name: dto.name.trim(),
        phone: dto.phone?.trim() || person.phone,
        note: dto.note?.trim() || null,
        leadId: person.leadId,
        clientId: person.clientId,
        staffId: dto.staffId ?? null,
        createdById: actor.id,
      },
      include: CALENDAR_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateConsultationAppointmentDto) {
    const current = await this.prisma.consultationAppointment.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Товлосон цаг олдсонгүй');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt;
    const durationMinutes = dto.durationMinutes ?? current.durationMinutes;
    // Giving a day-only booking an hour is what turns it into a block.
    const allDay = dto.startsAt && dto.allDay === undefined ? false : (dto.allDay ?? current.allDay);
    const staffId = dto.staffId === undefined ? current.staffId : dto.staffId;
    const status = dto.status ?? current.status;
    const moved =
      startsAt.getTime() !== current.startsAt.getTime() ||
      durationMinutes !== current.durationMinutes ||
      allDay !== current.allDay ||
      staffId !== current.staffId;

    // Only a time that is still going to happen has to fit the week: closing
    // out last Friday's visit must not fail because the rules changed since.
    if (status === AppointmentStatus.SCHEDULED && moved) {
      if (!allDay) this.assertInsideOffice(startsAt, durationMinutes);
      if (staffId && !allDay) await this.assertStaffFree(staffId, startsAt, durationMinutes, id);
    }

    const person =
      dto.leadId !== undefined || dto.clientId !== undefined
        ? await this.resolvePerson(
            dto.leadId === undefined ? current.leadId : dto.leadId,
            dto.clientId === undefined ? current.clientId : dto.clientId,
          )
        : null;

    return this.prisma.consultationAppointment.update({
      where: { id },
      data: {
        startsAt,
        durationMinutes,
        allDay,
        staffId,
        status,
        mode: dto.mode,
        name: dto.name?.trim() || undefined,
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        note: dto.note === undefined ? undefined : dto.note?.trim() || null,
        ...(person ? { leadId: person.leadId, clientId: person.clientId } : {}),
      },
      include: CALENDAR_INCLUDE,
    });
  }

  async remove(id: string) {
    const current = await this.prisma.consultationAppointment.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundException('Товлосон цаг олдсонгүй');
    await this.prisma.consultationAppointment.delete({ where: { id } });
  }

  /**
   * The assistant's booking, called from `create_consultation_request`.
   *
   * One conversation is one booking: a second call with a new time — "Даваа
   * биш Мягмар болно" — moves the assistant's open booking for that lead rather
   * than adding a second block, which would leave the office expecting the
   * person twice. A booking staff made is never touched from here.
   */
  async bookFromAssistant(booking: AssistantBooking) {
    if (!booking.leadId && !booking.clientId) return null;
    const startsAt = booking.time
      ? new Date(`${booking.date}T${booking.time}:00${OFFICE_UTC_OFFSET}`)
      : this.openingOf(booking.date);
    if (!startsAt || Number.isNaN(startsAt.getTime())) return null;

    try {
      const person = await this.assistantPerson(booking);
      const data = {
        startsAt,
        allDay: !booking.time,
        durationMinutes: DEFAULT_DURATION,
        mode: booking.mode ?? ConsultationMode.OFFICE,
        name: person.name,
        phone: person.phone,
        note: booking.note ?? null,
      };

      const open = await this.prisma.consultationAppointment.findFirst({
        where: {
          createdById: null,
          status: AppointmentStatus.SCHEDULED,
          ...(booking.leadId ? { leadId: booking.leadId } : { clientId: booking.clientId }),
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      return open
        ? await this.prisma.consultationAppointment.update({ where: { id: open.id }, data })
        : await this.prisma.consultationAppointment.create({
            data: { ...data, leadId: booking.leadId, clientId: booking.clientId ?? person.clientId },
          });
    } catch (error) {
      // The lead is the valuable part and it is already filed; a calendar row
      // that failed to write must not turn the visitor's booking into an error.
      this.logger.error(`Зөвлөгөөний цаг бичиж чадсангүй (${booking.leadId ?? booking.clientId})`, error as Error);
      return null;
    }
  }

  private async assistantPerson(booking: AssistantBooking) {
    const lead = booking.leadId
      ? await this.prisma.lead.findUnique({
          where: { id: booking.leadId },
          select: { firstName: true, lastName: true, phone: true, client: { select: { id: true } } },
        })
      : null;
    const client =
      !lead && booking.clientId
        ? await this.prisma.client.findUnique({
            where: { id: booking.clientId },
            select: { firstName: true, lastName: true, phone: true },
          })
        : null;
    const record = lead ?? client;
    // "—" is what the chat files for the half of a name nobody said.
    const recordName = record ? [record.lastName, record.firstName].filter((part) => part && part !== '—').join(' ') : '';

    return {
      name: booking.name?.trim() || recordName || 'Нэр тодорхойгүй',
      phone: booking.phone?.trim() || record?.phone || null,
      clientId: lead?.client?.id ?? null,
    };
  }

  private openingOf(date: string): Date | null {
    const noon = new Date(`${date}T12:00:00${OFFICE_UTC_OFFSET}`);
    if (Number.isNaN(noon.getTime())) return null;
    const hours = OFFICE.hours[officeClock(noon).day];
    return hours ? new Date(`${date}T${pad(hours[0])}:00:00${OFFICE_UTC_OFFSET}`) : null;
  }

  private assertInsideOffice(startsAt: Date, durationMinutes: number) {
    const problem = officeBlockProblem(startsAt, durationMinutes);
    if (problem) throw new BadRequestException(`Ажлын цагаас гадуур: ${problem}`);
  }

  /** Two people can be seen at once — by two consultants, never by one. */
  private async assertStaffFree(staffId: string, startsAt: Date, durationMinutes: number, exceptId: string | null) {
    const endsAt = startsAt.getTime() + durationMinutes * 60_000;
    const sameDay = await this.prisma.consultationAppointment.findMany({
      where: {
        staffId,
        allDay: false,
        status: AppointmentStatus.SCHEDULED,
        startsAt: { gte: new Date(startsAt.getTime() - DAY_MS), lt: new Date(endsAt) },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { startsAt: true, durationMinutes: true, name: true },
    });

    const clash = sameDay.find((other) => other.startsAt.getTime() + other.durationMinutes * 60_000 > startsAt.getTime());
    if (clash) {
      const { hour, minute } = officeClock(clash.startsAt);
      throw new BadRequestException(`Энэ зөвлөх ${pad(hour)}:${pad(minute)}-д ${clash.name}-тай уулзалттай байна`);
    }
  }

  /**
   * The lead and the client behind a booking, and the phone to fall back on.
   * A lead that became a client carries the client too, so the block links to
   * the card the office actually works from (1B-26).
   */
  private async resolvePerson(leadId: string | null, clientId: string | null) {
    let phone: string | null = null;
    let resolvedClientId = clientId;

    if (leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId },
        select: { phone: true, client: { select: { id: true } } },
      });
      if (!lead) throw new BadRequestException('Сонгосон зөвлөгөө хүсэлт олдсонгүй');
      phone = lead.phone;
      resolvedClientId ??= lead.client?.id ?? null;
    }

    if (resolvedClientId) {
      const client = await this.prisma.client.findUnique({ where: { id: resolvedClientId }, select: { phone: true } });
      if (!client) throw new BadRequestException('Сонгосон үйлчлүүлэгч олдсонгүй');
      phone ??= client.phone;
    }

    return { leadId, clientId: resolvedClientId, phone };
  }
}
