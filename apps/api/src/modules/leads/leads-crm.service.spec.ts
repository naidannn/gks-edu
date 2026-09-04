import { describe, expect, it, vi } from 'vitest';
import { LeadActivityType, LeadStage, Role } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { LEAD_STAGE_TRANSITIONS, LeadsService } from './leads.service.js';

/** Minimal Prisma double for the staff-CRM paths: transitions, activities, assignment. */
function prismaStub(overrides: {
  lead?: Record<string, unknown> | null;
  staff?: { id: string }[];
  loads?: { assignedToId: string | null; _count: { _all: number } }[];
} = {}) {
  const lead = overrides.lead ?? { id: 'lead-1', stage: LeadStage.NEW, lostReason: null };

  const prisma = {
    lead: {
      findUnique: vi.fn().mockResolvedValue(lead),
      update: vi.fn().mockImplementation(({ data }: { data: unknown }) => ({ ...lead, ...(data as object) })),
      groupBy: vi.fn().mockResolvedValue(overrides.loads ?? []),
    },
    leadActivity: {
      create: vi.fn().mockResolvedValue({ id: 'activity-1' }),
    },
    user: {
      // Echoes back whichever id was queried, so round-robin's chosen candidate resolves correctly.
      findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, name: 'Дорж', email: `${where.id}@gks.edu` }),
      ),
      findMany: vi.fn().mockResolvedValue(overrides.staff ?? [{ id: 'staff-1' }]),
    },
    $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

describe('LEAD_STAGE_TRANSITIONS', () => {
  it('makes WON and LOST-reopen the only ways out of the funnel', () => {
    expect(LEAD_STAGE_TRANSITIONS[LeadStage.WON]).toEqual([]);
    expect(LEAD_STAGE_TRANSITIONS[LeadStage.LOST]).toEqual([LeadStage.CONTACTED]);
    expect(LEAD_STAGE_TRANSITIONS[LeadStage.NEW]).toContain(LeadStage.CONTACTED);
  });
});

describe('LeadsService.transition', () => {
  it('rejects a jump that skips the funnel', async () => {
    const prisma = prismaStub({ lead: { id: 'lead-1', stage: LeadStage.NEW } });
    const service = new LeadsService(prisma);

    await expect(service.transition('lead-1', { stage: LeadStage.WON }, 'actor-1')).rejects.toThrow(
      /NEW төлөвөөс WON рүү шилжих боломжгүй/,
    );
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('requires a reason when moving to LOST', async () => {
    const prisma = prismaStub({ lead: { id: 'lead-1', stage: LeadStage.NEW } });
    const service = new LeadsService(prisma);

    await expect(service.transition('lead-1', { stage: LeadStage.LOST }, 'actor-1')).rejects.toThrow(
      /шалтгаан/,
    );
  });

  it('moves stage and logs a STAGE_CHANGE activity', async () => {
    const prisma = prismaStub({ lead: { id: 'lead-1', stage: LeadStage.NEW } });
    const service = new LeadsService(prisma);

    await service.transition('lead-1', { stage: LeadStage.CONTACTED }, 'actor-1');

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: LeadStage.CONTACTED }) }),
    );
    const activity = prisma.leadActivity.create.mock.calls[0]![0].data;
    expect(activity.type).toBe(LeadActivityType.STAGE_CHANGE);
    expect(activity.meta).toMatchObject({ from: LeadStage.NEW, to: LeadStage.CONTACTED });
    expect(activity.actorId).toBe('actor-1');
  });
});

describe('LeadsService.addActivity', () => {
  it('refuses a manually-logged STAGE_CHANGE — only /transitions may create one', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    await expect(
      service.addActivity('lead-1', { type: LeadActivityType.STAGE_CHANGE }, 'actor-1'),
    ).rejects.toThrow(/зөвхөн систем/);
  });

  it('logs a call note against the lead', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    await service.addActivity('lead-1', { type: LeadActivityType.CALL, body: 'Дуудлага хийсэн' }, 'actor-1');

    expect(prisma.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leadId: 'lead-1', type: LeadActivityType.CALL, actorId: 'actor-1' }),
      }),
    );
  });
});

describe('LeadsService.assign / autoAssign', () => {
  it('assigns to a named active staff member and logs a note', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    await service.assign('lead-1', { assignedToId: 'staff-1' }, 'actor-1');

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedToId: 'staff-1' } }),
    );
    expect(prisma.leadActivity.create).toHaveBeenCalled();
  });

  it('rejects assigning to someone who is not active staff', async () => {
    const prisma = prismaStub();
    prisma.user.findFirst.mockResolvedValueOnce(null);
    const service = new LeadsService(prisma);

    await expect(service.assign('lead-1', { assignedToId: 'nope' }, 'actor-1')).rejects.toThrow(
      /Идэвхтэй ажилтан/,
    );
  });

  it('unassigns when no assignedToId is given', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma);

    await service.assign('lead-1', {}, 'actor-1');

    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: { assignedToId: null } }));
  });

  it('round-robins to the staff member carrying the fewest open leads', async () => {
    const prisma = prismaStub({
      staff: [{ id: 'busy' }, { id: 'free' }],
      loads: [{ assignedToId: 'busy', _count: { _all: 5 } }],
    });
    const service = new LeadsService(prisma);

    await service.autoAssign('lead-1', 'actor-1');

    expect(prisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assignedToId: 'free' } }),
    );
  });

  it('refuses to auto-assign when no staff is active', async () => {
    const prisma = prismaStub({ staff: [] });
    const service = new LeadsService(prisma);

    await expect(service.autoAssign('lead-1', 'actor-1')).rejects.toThrow(/Идэвхтэй ажилтан алга/);
  });
});

describe('LeadsService.stats', () => {
  function statsStub(overrides: {
    byStage?: { stage: LeadStage; _count: { _all: number } }[];
    counts?: [total: number, unassigned: number, mineOpen: number, newLast7Days: number];
    recent?: unknown[];
  } = {}) {
    const counts = overrides.counts ?? [0, 0, 0, 0];
    let callIndex = 0;

    const prisma = {
      lead: {
        groupBy: vi.fn().mockResolvedValue(overrides.byStage ?? []),
        count: vi.fn().mockImplementation(() => Promise.resolve(counts[callIndex++])),
        findMany: vi.fn().mockResolvedValue(overrides.recent ?? []),
      },
      $transaction: vi.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    return prisma as unknown as PrismaService & typeof prisma;
  }

  it('fills every stage with 0 when the funnel is empty, even unrepresented ones', async () => {
    const prisma = statsStub({ byStage: [{ stage: LeadStage.NEW, _count: { _all: 3 } }] });
    const service = new LeadsService(prisma);

    const result = await service.stats('actor-1');

    expect(result.byStage[LeadStage.NEW]).toBe(3);
    expect(result.byStage[LeadStage.WON]).toBe(0);
    expect(result.byStage[LeadStage.LOST]).toBe(0);
    expect(Object.keys(result.byStage)).toHaveLength(Object.values(LeadStage).length);
  });

  it('reports total/unassigned/mine/recent counters in order', async () => {
    const prisma = statsStub({ counts: [12, 4, 2, 5] });
    const service = new LeadsService(prisma);

    const result = await service.stats('actor-1');

    expect(result).toMatchObject({ total: 12, unassigned: 4, mineOpen: 2, newLast7Days: 5 });
  });

  it("scopes the 'mine' counter to this actor's open (non-WON/LOST) leads", async () => {
    const prisma = statsStub();
    const service = new LeadsService(prisma);

    await service.stats('actor-42');

    const mineCountCall = prisma.lead.count.mock.calls[2]![0] as { where: { assignedToId: string; stage: { in: LeadStage[] } } };
    expect(mineCountCall.where.assignedToId).toBe('actor-42');
    expect(mineCountCall.where.stage.in).not.toContain(LeadStage.WON);
    expect(mineCountCall.where.stage.in).not.toContain(LeadStage.LOST);
  });
});

describe('Role', () => {
  it('carries the two staff roles added in 0-07', () => {
    expect(Role.CONSULTANT).toBe('CONSULTANT');
    expect(Role.DOC_OFFICER).toBe('DOC_OFFICER');
  });
});
