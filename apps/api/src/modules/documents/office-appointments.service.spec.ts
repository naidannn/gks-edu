import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AppointmentStatus, Role } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CaseDocumentsService } from './case-documents.service.js';
import { OfficeAppointmentsService } from './office-appointments.service.js';

const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;
const CLIENT = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;

function harness(options: { appointments?: unknown[]; outstanding?: { caseId: string; count: number }[] } = {}) {
  const prisma = {
    officeAppointment: {
      findMany: vi.fn().mockResolvedValue(options.appointments ?? []),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue({ id: 'appt-1', caseId: 'case-1', status: AppointmentStatus.SCHEDULED }),
      create: vi.fn().mockImplementation(({ data }: { data: unknown }) => data),
      update: vi.fn().mockImplementation(({ data }: { data: unknown }) => data),
    },
    caseDocument: {
      groupBy: vi
        .fn()
        .mockResolvedValue((options.outstanding ?? []).map((row) => ({ caseId: row.caseId, _count: { _all: row.count } }))),
    },
  } as unknown as PrismaService;

  const documents = {
    assertCaseAccess: vi.fn().mockResolvedValue(undefined),
    physicalOriginals: vi.fn().mockResolvedValue([]),
  } as unknown as CaseDocumentsService;

  return { service: new OfficeAppointmentsService(prisma, documents), prisma, documents };
}

/**
 * 1D-25 — booking lived only in the client's cabinet, so the desk the client
 * was walking towards could not see them coming. The sheet answers both halves
 * of the question: who is due in, and whether the visit is still needed.
 */
describe('OfficeAppointmentsService.findUpcoming — the front-office day sheet (1D-25)', () => {
  it('counts what is still to be handed over, one query for the whole sheet', async () => {
    const { service, prisma } = harness({
      appointments: [
        { id: 'appt-1', caseId: 'case-1', scheduledAt: new Date(), status: AppointmentStatus.SCHEDULED },
        { id: 'appt-2', caseId: 'case-2', scheduledAt: new Date(), status: AppointmentStatus.SCHEDULED },
      ],
      outstanding: [{ caseId: 'case-1', count: 3 }],
    });

    const sheet = await service.findUpcoming({});

    expect(prisma.caseDocument.groupBy).toHaveBeenCalledTimes(1);
    expect(sheet.map((row) => row.outstandingOriginals)).toEqual([3, 0]);
  });

  it('defaults to the visits nobody has closed out yet', async () => {
    const { service, prisma } = harness({ appointments: [] });

    await service.findUpcoming({});

    expect(prisma.officeAppointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: AppointmentStatus.SCHEDULED }) }),
    );
    // Nothing on the sheet means nothing to count — the second query is skipped.
    expect(prisma.caseDocument.groupBy).not.toHaveBeenCalled();
  });
});

describe('OfficeAppointmentsService.update — who turned up is the desk`s call', () => {
  it('lets staff record that nobody came', async () => {
    const { service, prisma } = harness();

    await service.update('appt-1', { status: AppointmentStatus.NO_SHOW }, STAFF);

    expect(prisma.officeAppointment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AppointmentStatus.NO_SHOW }) }),
    );
  });

  it('refuses to let a client mark their own visit completed', async () => {
    const { service } = harness();

    await expect(service.update('appt-1', { status: AppointmentStatus.COMPLETED }, CLIENT)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('still lets a client cancel', async () => {
    const { service, prisma } = harness();

    await service.update('appt-1', { status: AppointmentStatus.CANCELLED }, CLIENT);

    expect(prisma.officeAppointment.update).toHaveBeenCalled();
  });
});
