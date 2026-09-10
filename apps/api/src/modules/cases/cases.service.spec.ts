import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AdmissionsService } from '../admissions/admissions.service.js';
import { CasesService } from './cases.service.js';

/**
 * Minimal Prisma double for the transition engine (1C-03, 1C-15's system-transition hook).
 *
 * The case row carries a live `stage`, because the write is now conditional on
 * it: `updateMany` has to answer 0 when the case has moved on, or the
 * optimistic lock the service relies on is invisible here (1N-14).
 */
function prismaStub(overrides: {
  gksCase?: Record<string, unknown>;
  flowRule?: Record<string, unknown> | null;
  visitedStages?: CaseStage[];
} = {}) {
  const found: { id: string; code: string; serviceType: ServiceType; stage: CaseStage } = {
    id: 'case-1',
    code: 'GKS-2026-0001',
    serviceType: ServiceType.LANGUAGE_PREP,
    stage: CaseStage.CONTRACT_DRAFT,
    ...overrides.gksCase,
  };
  const visited = new Set(overrides.visitedStages ?? []);

  const prisma = {
    case: {
      findUnique: vi.fn().mockResolvedValue(found),
      findUniqueOrThrow: vi.fn().mockImplementation(() => Promise.resolve(found)),
      updateMany: vi.fn().mockImplementation(({ where, data }: { where: { stage: CaseStage }; data: { stage: CaseStage } }) => {
        if (found.stage !== where.stage) return Promise.resolve({ count: 0 });
        found.stage = data.stage;
        return Promise.resolve({ count: 1 });
      }),
    },
    caseFlowDefinition: {
      findUnique: vi.fn().mockResolvedValue(overrides.flowRule === undefined ? null : overrides.flowRule),
    },
    caseTransition: {
      create: vi.fn().mockResolvedValue({ id: 'transition-1' }),
      findFirst: vi.fn().mockImplementation(({ where }: { where: { toStage: CaseStage } }) =>
        Promise.resolve(visited.has(where.toStage) ? { id: 'transition-old' } : null),
      ),
    },
    $transaction: vi.fn().mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

const consultant: AuthenticatedUser = { id: 'staff-1', email: 'c@gks.edu', role: Role.CONSULTANT };

/** `transition` never touches the calendar; creation is covered separately. */
function admissionsStub() {
  return {
    assertSelectable: vi.fn(),
    applyDeadlineToCase: vi.fn().mockResolvedValue(0),
  } as unknown as AdmissionsService;
}

describe('CasesService.transition (1C-03)', () => {
  it('applies a manually-allowed transition and logs it under the acting staff member', async () => {
    const prisma = prismaStub({
      flowRule: { allowedRoles: [Role.ADMIN, Role.CONSULTANT], isSystemOnly: false },
    });
    const service = new CasesService(prisma, admissionsStub());

    await service.transition('case-1', { toStage: CaseStage.ON_HOLD }, consultant);

    // Conditional on the stage that was read: two staff clicking the same
    // button must not both apply it (1N-14).
    expect(prisma.case.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', stage: CaseStage.CONTRACT_DRAFT },
      data: { stage: CaseStage.ON_HOLD },
    });
    expect(prisma.caseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ caseId: 'case-1', toStage: CaseStage.ON_HOLD, actorId: 'staff-1' }),
    });
    // The stage and its trail entry are one fact, so they are one transaction.
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('refuses a second click that arrives after the case has already moved', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [Role.CONSULTANT], isSystemOnly: false } });
    const service = new CasesService(prisma, admissionsStub());
    // Somebody else's write landed between our read and our own.
    prisma.case.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.transition('case-1', { toStage: CaseStage.ON_HOLD }, consultant)).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.caseTransition.create).not.toHaveBeenCalled();
  });

  it('rejects a stage with no CaseFlowDefinition row', async () => {
    const prisma = prismaStub({ flowRule: null });
    const service = new CasesService(prisma, admissionsStub());

    await expect(service.transition('case-1', { toStage: CaseStage.COMPLETED }, consultant)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a system-only edge even for an admin — payment/contract signing must drive it', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [], isSystemOnly: true } });
    const service = new CasesService(prisma, admissionsStub());

    await expect(
      service.transition('case-1', { toStage: CaseStage.PREPAYMENT_PAID }, consultant),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a role that isn't in the rule's allowedRoles", async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [Role.ADMIN], isSystemOnly: false } });
    const service = new CasesService(prisma, admissionsStub());

    await expect(service.transition('case-1', { toStage: CaseStage.ON_HOLD }, consultant)).rejects.toThrow(
      ForbiddenException,
    );
  });
});

describe('CasesService.transition — resuming a paused case (1N-06)', () => {
  it('refuses a resume into a stage the case has never been at', async () => {
    // Parked at CONTRACT_DRAFT, so there is no contract and no prepayment
    // behind it — and DOCUMENTS is a stage past both.
    const prisma = prismaStub({
      gksCase: { stage: CaseStage.ON_HOLD },
      flowRule: { allowedRoles: [Role.ADMIN, Role.CONSULTANT], isSystemOnly: false },
      visitedStages: [CaseStage.ON_HOLD],
    });
    const service = new CasesService(prisma, admissionsStub());

    await expect(service.transition('case-1', { toStage: CaseStage.DOCUMENTS }, consultant)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });

  it('allows a resume into a stage the trail says it was at', async () => {
    const prisma = prismaStub({
      gksCase: { stage: CaseStage.ON_HOLD },
      flowRule: { allowedRoles: [Role.ADMIN, Role.CONSULTANT], isSystemOnly: false },
      visitedStages: [CaseStage.DOCUMENTS, CaseStage.ON_HOLD],
    });
    const service = new CasesService(prisma, admissionsStub());

    await service.transition('case-1', { toStage: CaseStage.DOCUMENTS }, consultant);

    expect(prisma.case.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', stage: CaseStage.ON_HOLD },
      data: { stage: CaseStage.DOCUMENTS },
    });
  });

  it('allows a resume into the stage every case starts at, which leaves no trail row behind it', async () => {
    const prisma = prismaStub({
      gksCase: { stage: CaseStage.ON_HOLD },
      flowRule: { allowedRoles: [Role.ADMIN, Role.CONSULTANT], isSystemOnly: false },
      visitedStages: [CaseStage.ON_HOLD],
    });
    const service = new CasesService(prisma, admissionsStub());

    await service.transition('case-1', { toStage: CaseStage.CONTRACT_DRAFT }, consultant);

    expect(prisma.caseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ toStage: CaseStage.CONTRACT_DRAFT }),
    });
  });
});

describe('CasesService.applySystemTransition (1C-15)', () => {
  it('advances the case when a matching isSystemOnly rule exists', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [], isSystemOnly: true } });
    const service = new CasesService(prisma, admissionsStub());

    await service.applySystemTransition(prisma, 'case-1', CaseStage.PREPAYMENT_PAID);

    expect(prisma.case.updateMany).toHaveBeenCalledWith({
      where: { id: 'case-1', stage: CaseStage.CONTRACT_DRAFT },
      data: { stage: CaseStage.PREPAYMENT_PAID },
    });
    expect(prisma.caseTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: null, toStage: CaseStage.PREPAYMENT_PAID }),
    });
  });

  it('refuses to run when the target is not flagged isSystemOnly (prevents bypassing manual role checks)', async () => {
    const prisma = prismaStub({ flowRule: { allowedRoles: [Role.ADMIN], isSystemOnly: false } });
    const service = new CasesService(prisma, admissionsStub());

    await expect(service.applySystemTransition(prisma, 'case-1', CaseStage.ON_HOLD)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });
});

describe('CasesService.applyDomainTransition — filling in a skipped step (1N-27)', () => {
  it('walks the main line forward when the edge from where the case stands is missing', async () => {
    // The school invoice and the invitation were never recorded, so the case is
    // still at ADMITTED when the visa comes through. Refusing to move it strands
    // the case: the balance invoice is then refused for a stage it never reached.
    const prisma = prismaStub({
      gksCase: { serviceType: ServiceType.BACHELOR, stage: CaseStage.ADMITTED },
      flowRule: null,
    });
    const service = new CasesService(prisma, admissionsStub());

    const moved = await service.applyDomainTransition('case-1', CaseStage.VISA_APPROVED, 'staff-1', 'Виз гарсан');

    expect(moved).toBe(true);
    const hops = prisma.caseTransition.create.mock.calls.map(
      (call) => (call[0] as { data: { fromStage: CaseStage; toStage: CaseStage; reason: string } }).data,
    );
    expect(hops.map((hop) => hop.toStage)).toEqual([
      CaseStage.TUITION_INVOICED,
      CaseStage.INVITATION_RECEIVED,
      CaseStage.VISA,
      CaseStage.VISA_APPROVED,
    ]);
    expect(hops[0]!.fromStage).toBe(CaseStage.ADMITTED);
    // The filled-in hops say so; only the one the caller asked for reads plain.
    expect(hops[0]!.reason).toBe('Виз гарсан (алгассан шат)');
    expect(hops.at(-1)!.reason).toBe('Виз гарсан');
  });

  it('leaves an escape stage alone — REJECTED is not somewhere on the main line', async () => {
    const prisma = prismaStub({
      gksCase: { serviceType: ServiceType.BACHELOR, stage: CaseStage.ADMITTED },
      flowRule: null,
    });
    const service = new CasesService(prisma, admissionsStub());

    const moved = await service.applyDomainTransition('case-1', CaseStage.REJECTED, 'staff-1', 'Виз татгалзсан');

    expect(moved).toBe(false);
    expect(prisma.caseTransition.create).not.toHaveBeenCalled();
  });

  it('will not walk backwards', async () => {
    const prisma = prismaStub({
      gksCase: { serviceType: ServiceType.BACHELOR, stage: CaseStage.VISA_APPROVED },
      flowRule: null,
    });
    const service = new CasesService(prisma, admissionsStub());

    const moved = await service.applyDomainTransition('case-1', CaseStage.ADMITTED, 'staff-1', 'Буцаалт');

    expect(moved).toBe(false);
    expect(prisma.case.updateMany).not.toHaveBeenCalled();
  });
});

describe('CasesService.replaceUniversityChoices — moving the first choice (1N-13)', () => {
  function replaceStub() {
    const found = {
      id: 'case-1',
      serviceType: ServiceType.BACHELOR,
      universityId: 'uni-old',
      intakeId: 'intake-old',
    };

    const prisma = {
      case: {
        findUnique: vi.fn().mockResolvedValue(found),
        update: vi.fn().mockResolvedValue(found),
      },
      university: { findMany: vi.fn().mockResolvedValue([{ id: 'uni-new' }]) },
      universityProgram: { findMany: vi.fn().mockResolvedValue([]) },
      caseUniversityChoice: { deleteMany: vi.fn(), createMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return prisma as unknown as PrismaService & typeof prisma;
  }

  it('drops the intake instead of 400ing when the school changes', async () => {
    // `assertSelectable` throws on an intake belonging to another school, so
    // asking it first made the documented "the intake is dropped" branch
    // unreachable and the endpoint always failed.
    const prisma = replaceStub();
    const admissions = admissionsStub();
    vi.mocked(admissions.assertSelectable).mockRejectedValue(
      new BadRequestException('Сонгосон элсэлт тухайн сургуульд харьяалагдахгүй байна.'),
    );
    const service = new CasesService(prisma, admissions);

    await service.replaceUniversityChoices('case-1', { universityChoices: [{ universityId: 'uni-new' }] });

    expect(admissions.assertSelectable).not.toHaveBeenCalled();
    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: expect.objectContaining({ universityId: 'uni-new', intakeId: null }),
    });
  });

  it('still checks the round when the school stayed put', async () => {
    const prisma = replaceStub();
    prisma.university.findMany.mockResolvedValue([{ id: 'uni-old' }]);
    const admissions = admissionsStub();
    const service = new CasesService(prisma, admissions);

    await service.replaceUniversityChoices('case-1', { universityChoices: [{ universityId: 'uni-old' }] });

    // The programme travels with the school: a programme on its own calendar
    // is judged against its override, not against the round (1N-28).
    expect(admissions.assertSelectable).toHaveBeenCalledWith(
      'intake-old',
      'uni-old',
      ServiceType.BACHELOR,
      undefined,
      null,
    );
  });
});
