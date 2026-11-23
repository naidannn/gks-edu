import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { officeBlockProblem, scheduleLine } from '../../common/office-hours.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppointmentStatus, Role } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ConsultationAppointmentsService } from './consultation-appointments.service.js';

/**
 * 1B-30 — the consultation calendar. The business rule that matters is the
 * week: Monday–Friday 09:00–18:00, and Saturday and Sunday full days off
 * (2026-11-23). Every way onto the calendar is held to it.
 */
const ub = (local: string) => new Date(`${local}+08:00`);
const actor = { id: 'staff-1', role: Role.CONSULTANT } as AuthenticatedUser;

function harness() {
  const prisma = {
    consultationAppointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'existing', ...data })),
      delete: vi.fn().mockResolvedValue({}),
    },
    officeAppointment: { findMany: vi.fn().mockResolvedValue([]) },
    lead: {
      findUnique: vi.fn().mockResolvedValue({
        firstName: 'Болд',
        lastName: 'Бат',
        phone: '99112233',
        client: null,
      }),
    },
    client: { findUnique: vi.fn().mockResolvedValue({ firstName: 'Сараа', lastName: 'Дорж', phone: '88001122' }) },
  };

  return { prisma, service: new ConsultationAppointmentsService(prisma as unknown as PrismaService) };
}

describe('the office week', () => {
  it('reads Monday–Friday and rests both weekend days', () => {
    expect(scheduleLine()).toBe('Даваа–Баасан 09:00–18:00, Бямба, Ням гарагт амарна');
  });

  it.each([
    ['2026-11-23T09:00:00', 30, null],
    ['2026-11-27T17:30:00', 30, null],
    ['2026-11-28T11:00:00', 30, 'Бямба гарагт оффис амарна'],
    ['2026-11-29T11:00:00', 30, 'Ням гарагт оффис амарна'],
    ['2026-11-23T08:30:00', 30, '09:00–18:00'],
    // Starts inside the day but runs past closing.
    ['2026-11-23T17:45:00', 30, '09:00–18:00'],
  ])('%s for %i min → %s', (local, minutes, problem) => {
    const result = officeBlockProblem(ub(local), minutes);
    if (problem === null) expect(result).toBeNull();
    else expect(result).toContain(problem);
  });
});

describe('ConsultationAppointmentsService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('calendar', () => {
    it('refuses a range wider than six weeks', async () => {
      const { service } = harness();
      await expect(
        service.calendar({ from: '2026-11-01T00:00:00Z', to: '2027-01-01T00:00:00Z' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns the week, the consultations and the clients’ office visits together', async () => {
      const { service, prisma } = harness();
      prisma.officeAppointment.findMany.mockResolvedValue([
        {
          id: 'visit-1',
          scheduledAt: ub('2026-11-24T10:00:00'),
          status: AppointmentStatus.SCHEDULED,
          note: null,
          case: { id: 'case-1', code: 'KH-2026-0001', user: { name: 'Сараа', phone: '88001122' } },
        },
      ]);

      const result = await service.calendar({ from: '2026-11-23T00:00:00+08:00', to: '2026-11-30T00:00:00+08:00' });

      expect(result.hours[6]).toBeNull();
      expect(result.officeVisits[0]).toMatchObject({ caseCode: 'KH-2026-0001', name: 'Сараа' });
    });
  });

  describe('create', () => {
    it('refuses a Saturday', async () => {
      const { service, prisma } = harness();
      await expect(
        service.create({ startsAt: ub('2026-11-28T11:00:00').toISOString(), name: 'Бат' }, actor),
      ).rejects.toThrow('Бямба гарагт оффис амарна');
      expect(prisma.consultationAppointment.create).not.toHaveBeenCalled();
    });

    it('takes the phone from the lead and links the client the lead became', async () => {
      const { service, prisma } = harness();
      prisma.lead.findUnique.mockResolvedValue({ firstName: 'Болд', lastName: 'Бат', phone: '99112233', client: { id: 'client-7' } });

      await service.create({ startsAt: ub('2026-11-24T14:00:00').toISOString(), name: 'Бат Болд', leadId: 'lead-1' }, actor);

      expect(prisma.consultationAppointment.create.mock.calls[0]![0].data).toMatchObject({
        phone: '99112233',
        leadId: 'lead-1',
        clientId: 'client-7',
        createdById: 'staff-1',
        durationMinutes: 30,
      });
    });

    it('will not give one consultant two people at once', async () => {
      const { service, prisma } = harness();
      prisma.consultationAppointment.findMany.mockResolvedValue([
        { startsAt: ub('2026-11-24T13:45:00'), durationMinutes: 30, name: 'Сараа' },
      ]);

      await expect(
        service.create(
          { startsAt: ub('2026-11-24T14:00:00').toISOString(), name: 'Бат', staffId: 'staff-2' },
          actor,
        ),
      ).rejects.toThrow('13:45-д Сараа');
    });

    it('lets back-to-back blocks touch', async () => {
      const { service, prisma } = harness();
      prisma.consultationAppointment.findMany.mockResolvedValue([
        { startsAt: ub('2026-11-24T13:30:00'), durationMinutes: 30, name: 'Сараа' },
      ]);

      await service.create({ startsAt: ub('2026-11-24T14:00:00').toISOString(), name: 'Бат', staffId: 'staff-2' }, actor);

      expect(prisma.consultationAppointment.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('closes out a past booking even though it would not fit the week today', async () => {
      const { service, prisma } = harness();
      // A Saturday visit booked before Saturday became a day off.
      prisma.consultationAppointment.findUnique.mockResolvedValue({
        id: 'old',
        startsAt: ub('2026-11-21T12:00:00'),
        durationMinutes: 30,
        allDay: false,
        staffId: null,
        status: AppointmentStatus.SCHEDULED,
        leadId: null,
        clientId: null,
      });

      await service.update('old', { status: AppointmentStatus.COMPLETED });

      expect(prisma.consultationAppointment.update.mock.calls[0]![0].data.status).toBe(AppointmentStatus.COMPLETED);
    });

    it('turns a day-only booking into a block once staff give it an hour', async () => {
      const { service, prisma } = harness();
      prisma.consultationAppointment.findUnique.mockResolvedValue({
        id: 'ai',
        startsAt: ub('2026-11-24T09:00:00'),
        durationMinutes: 30,
        allDay: true,
        staffId: null,
        status: AppointmentStatus.SCHEDULED,
        leadId: 'lead-1',
        clientId: null,
      });

      await service.update('ai', { startsAt: ub('2026-11-24T15:00:00').toISOString() });

      expect(prisma.consultationAppointment.update.mock.calls[0]![0].data.allDay).toBe(false);
    });
  });

  describe('bookFromAssistant', () => {
    it('books a day without an hour at that day’s opening, marked all-day', async () => {
      const { service, prisma } = harness();

      await service.bookFromAssistant({ leadId: 'lead-1', date: '2026-11-24', phone: '99112233' });

      expect(prisma.consultationAppointment.create.mock.calls[0]![0].data).toMatchObject({
        leadId: 'lead-1',
        allDay: true,
        startsAt: ub('2026-11-24T09:00:00'),
        // The chat files "—" for the half of a name nobody said; it is not repeated here.
        name: 'Бат Болд',
      });
    });

    it('moves its own open booking when the visitor changes the day', async () => {
      const { service, prisma } = harness();
      prisma.consultationAppointment.findFirst.mockResolvedValue({ id: 'existing' });

      await service.bookFromAssistant({ leadId: 'lead-1', date: '2026-11-25', time: '15:00' });

      expect(prisma.consultationAppointment.findFirst.mock.calls[0]![0].where).toMatchObject({
        leadId: 'lead-1',
        createdById: null,
        status: AppointmentStatus.SCHEDULED,
      });
      expect(prisma.consultationAppointment.update.mock.calls[0]![0]).toMatchObject({
        where: { id: 'existing' },
        data: { startsAt: ub('2026-11-25T15:00:00'), allDay: false },
      });
      expect(prisma.consultationAppointment.create).not.toHaveBeenCalled();
    });

    it('never fails the chat when the calendar write does', async () => {
      const { service, prisma } = harness();
      prisma.consultationAppointment.create.mockRejectedValue(new Error('db down'));

      await expect(service.bookFromAssistant({ leadId: 'lead-1', date: '2026-11-24' })).resolves.toBeNull();
    });
  });
});
