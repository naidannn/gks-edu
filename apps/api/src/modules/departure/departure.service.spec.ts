import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../prisma/client.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { DepartureService } from './departure.service.js';

const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;
const CLIENT = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;

function harness(options: { plan?: Record<string, unknown> | null; gksCase?: Record<string, unknown> | null } = {}) {
  const plan =
    options.plan === undefined
      ? {
          id: 'plan-1',
          departureAt: null,
          flightNo: null,
          arrivalAt: null,
          items: [],
          case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1', university: null },
        }
      : options.plan;

  const prisma = {
    departurePlan: {
      findUnique: vi.fn().mockResolvedValue(plan),
      create: vi.fn().mockResolvedValue(plan),
      update: vi.fn().mockResolvedValue(plan),
    },
    departureChecklistTemplate: { findMany: vi.fn().mockResolvedValue([]) },
    departureChecklistItem: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'i1', template: { offsetDays: 14 } },
        { id: 'i2', template: { offsetDays: 14 } },
        { id: 'i3', template: { offsetDays: 7 } },
        { id: 'i4', template: { offsetDays: null } },
      ]),
      updateMany: vi.fn().mockReturnValue({ __op: 'updateMany' }),
    },
    case: { findUnique: vi.fn().mockResolvedValue(options.gksCase === undefined ? { id: 'case-1' } : options.gksCase) },
    $transaction: vi.fn().mockImplementation((writes: unknown[]) => Promise.resolve(writes)),
  } as unknown as PrismaService;

  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  return { service: new DepartureService(prisma, notifications), prisma, notifications };
}

/** 1N-26 — the foreign-key violation used to reach the client as a bare 500. */
describe('DepartureService.ensurePlan — an unknown case is a 404 (1N-26)', () => {
  it('says so in Mongolian instead of letting the constraint fail', async () => {
    const { service } = harness({ plan: null, gksCase: null });

    await expect(service.ensurePlan('case-missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('costs no extra query when the plan already exists', async () => {
    const { service, prisma } = harness();

    await service.ensurePlan('case-1');

    expect(prisma.case.findUnique).not.toHaveBeenCalled();
  });
});

/**
 * 1N-26 — one `UPDATE` per checklist item against a database 115 ms away, and
 * no two of them atomic. Items sharing an offset share a date.
 */
describe('DepartureService — re-dating the checklist is one batch (1N-26)', () => {
  it('groups the items by offset and writes them in a single transaction', async () => {
    const { service, prisma } = harness();

    await service.updatePlan('case-1', { departureAt: '2027-02-20T00:00:00.000Z' }, STAFF);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Two offsets, so two statements — not four, and not one per item.
    expect(prisma.departureChecklistItem.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.departureChecklistItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i2'] } },
      data: { dueAt: new Date('2027-02-06T00:00:00.000Z') },
    });
  });
});

/** 1N-26 — telling a client about their own edit is noise, not news. */
describe('DepartureService.updatePlan — no self-notification (1N-26)', () => {
  it('notifies the client when the office moved the flight', async () => {
    const { service, notifications } = harness();

    await service.updatePlan('case-1', { flightNo: 'OM-501' }, STAFF);

    expect(notifications.dispatch).toHaveBeenCalled();
  });

  it('says nothing when the case owner made the edit themselves', async () => {
    const { service, notifications } = harness();

    await service.updatePlan('case-1', { flightNo: 'OM-501' }, CLIENT);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
