import { describe, expect, it, vi } from 'vitest';
import {
  CaseStage,
  DocStage,
  DocumentStatus,
  EducationLevel,
  GuarantorRelation,
  GuarantorType,
  Necessity,
  type Prisma,
  ServiceType,
} from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
import { buildRuleWhere, type ResolutionContext, RequirementsService } from './requirements.service.js';

/** Only the one call the requirement engine makes into the case flow. */
function casesStub(moved = true) {
  const cases = { applyDomainTransition: vi.fn().mockResolvedValue(moved) };
  return cases as unknown as CasesService & typeof cases;
}

const HIGH_SCHOOL_LEAVER: ResolutionContext = {
  serviceType: ServiceType.LANGUAGE_PREP,
  educationLevel: EducationLevel.SECONDARY_SCHOOL,
  guarantorType: GuarantorType.EMPLOYEE,
  guarantorRelation: GuarantorRelation.PARENT,
  universityId: null,
};

/**
 * The where-clause is the rule engine: an empty array on a rule means "applies
 * to everyone", so every filter has to be `isEmpty OR has(value)`. These assert
 * the shape rather than round-tripping through Postgres.
 */
describe('buildRuleWhere (1D-04)', () => {
  it('lets a universal rule (all arrays empty) through every dimension', () => {
    const clauses = buildRuleWhere(HIGH_SCHOOL_LEAVER).AND as Prisma.RequirementRuleWhereInput[];

    expect(clauses).toContainEqual({
      OR: [{ serviceTypes: { isEmpty: true } }, { serviceTypes: { has: ServiceType.LANGUAGE_PREP } }],
    });
    expect(clauses).toContainEqual({
      OR: [{ educationLevels: { isEmpty: true } }, { educationLevels: { has: EducationLevel.SECONDARY_SCHOOL } }],
    });
  });

  it('only matches universal rules on a dimension the client has not answered', () => {
    const clauses = buildRuleWhere({ ...HIGH_SCHOOL_LEAVER, educationLevel: null, guarantorRelation: null })
      .AND as Prisma.RequirementRuleWhereInput[];

    // An unanswered questionnaire must not pull in the high-school-only papers.
    expect(clauses).toContainEqual({ educationLevels: { isEmpty: true } });
    expect(clauses).toContainEqual({ guarantorRelations: { isEmpty: true } });
  });

  it('restricts a case with no university to universal rules only', () => {
    const clauses = buildRuleWhere(HIGH_SCHOOL_LEAVER).AND as Prisma.RequirementRuleWhereInput[];
    expect(clauses).toContainEqual({ universityId: null });
  });

  it('accepts both universal and school-specific rules once a university is chosen (1D-18)', () => {
    const clauses = buildRuleWhere({ ...HIGH_SCHOOL_LEAVER, universityId: 'uni-1' })
      .AND as Prisma.RequirementRuleWhereInput[];
    expect(clauses).toContainEqual({ OR: [{ universityId: null }, { universityId: 'uni-1' }] });
  });

  it('never lets a NONE guarantor pick up sponsor paperwork', () => {
    const clauses = buildRuleWhere({ ...HIGH_SCHOOL_LEAVER, guarantorType: GuarantorType.NONE })
      .AND as Prisma.RequirementRuleWhereInput[];
    expect(clauses).toContainEqual({
      OR: [{ guarantorTypes: { isEmpty: true } }, { guarantorTypes: { has: GuarantorType.NONE } }],
    });
  });
});

function rule(id: string, templateId: string, overrides: Record<string, unknown> = {}) {
  return { id, templateId, necessity: Necessity.REQUIRED, conditionNote: null, ...overrides };
}

/** A `CaseDocument` the engine produced — the kind it is allowed to withdraw. */
function ruleRow(id: string, templateId: string, overrides: Record<string, unknown> = {}) {
  return { id, templateId, ruleId: `rule-of-${templateId}`, status: DocumentStatus.NOT_STARTED, deletedAt: null, ...overrides };
}

function prismaStub(options: {
  rules: ReturnType<typeof rule>[];
  existing?: Record<string, unknown>[];
  conditions?: Record<string, unknown> | null;
  stage?: CaseStage;
}) {
  const prisma = {
    case: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'case-1',
        serviceType: ServiceType.BACHELOR,
        stage: options.stage ?? CaseStage.PREPAYMENT_PAID,
        universityId: null,
        // `??` would swallow a deliberate null, which is the point of one test.
        conditions:
          'conditions' in options
            ? options.conditions
            : {
                educationLevel: EducationLevel.SECONDARY_SCHOOL,
                guarantorType: GuarantorType.EMPLOYEE,
                guarantorRelation: GuarantorRelation.PARENT,
              },
        user: { client: { educationLevel: EducationLevel.BACHELOR } },
      }),
    },
    requirementRule: { findMany: vi.fn().mockResolvedValue(options.rules) },
    caseDocument: {
      findMany: vi.fn().mockResolvedValue(options.existing ?? []),
      createMany: vi.fn().mockReturnValue({ __op: 'createMany' }),
      update: vi.fn().mockReturnValue({ __op: 'update' }),
      updateMany: vi.fn().mockReturnValue({ __op: 'updateMany' }),
    },
    // The resolver batches its writes, so the stubs above return descriptors
    // rather than promises and `$transaction` just collects them.
    $transaction: vi.fn().mockImplementation((writes: unknown[]) => Promise.resolve(writes)),
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

describe('RequirementsService.resolveForCase (1D-04)', () => {
  it('creates one CaseDocument per matched rule', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1'), rule('r2', 't2')] });

    const summary = await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary).toMatchObject({ created: 2, updated: 0, removed: 0 });
    // One `createMany`, not one `create` per rule: N sequential writes against
    // a database 115 ms away, and no two of them atomic (1N-52).
    expect(prisma.caseDocument.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('keeps a submitted document that no longer matches, and drops an untouched one (§7.1)', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1')],
      existing: [
        ruleRow('d1', 't1', { status: DocumentStatus.SUBMITTED }),
        ruleRow('d2', 't-gone', { status: DocumentStatus.SUBMITTED }),
        ruleRow('d3', 't-unused'),
      ],
    });

    const summary = await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary).toMatchObject({ created: 0, updated: 1, removed: 1, keptDespiteUnmatched: 1 });
    expect(prisma.caseDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d3'] } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  /**
   * 1N-18 — the client's own questionnaire re-runs this. A row with no `ruleId`
   * was put there by hand (1D-22) or demanded by the school through the
   * application (1E-04): the engine never issued it, so it never withdraws it.
   * Deleting one silently made the readiness gate report "ready" without it.
   */
  it('never removes a hand-added or school-requested document, even untouched', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1')],
      existing: [
        ruleRow('d1', 't1'),
        { id: 'd-manual', templateId: 't-manual', ruleId: null, status: DocumentStatus.NOT_STARTED, deletedAt: null },
      ],
    });

    const summary = await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary).toMatchObject({ removed: 0, keptDespiteUnmatched: 1 });
    expect(prisma.caseDocument.updateMany).not.toHaveBeenCalled();
  });

  /**
   * 1N-18 — `necessity` and `conditionNote` are the rule's opening offer, not
   * its standing instruction: a staff member who softened one document for this
   * client keeps that edit through the next re-resolve.
   */
  it('leaves a staff edit to necessity and the condition note alone on a re-run', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1', { necessity: Necessity.REQUIRED, conditionNote: 'Дүрмийн тайлбар' })],
      existing: [ruleRow('d1', 't1', { necessity: Necessity.OPTIONAL, conditionNote: 'Энэ харилцагчид шаардлагагүй' })],
    });

    await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    const [[call]] = (prisma.caseDocument.update as unknown as { mock: { calls: [{ data: Record<string, unknown> }][] } }).mock.calls;
    expect(call.data).not.toHaveProperty('necessity');
    expect(call.data).not.toHaveProperty('conditionNote');
    expect(call.data).toMatchObject({ ruleId: 'r1', sortOrder: 0, deletedAt: null });
  });

  it('restores a previously dropped document when its rule matches again', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1')],
      existing: [ruleRow('d1', 't1', { deletedAt: new Date() })],
    });

    await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(prisma.caseDocument.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ deletedAt: null }),
    });
  });

  it('lists a template once even when two rules name it', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1'), rule('r2', 't1', { necessity: Necessity.OPTIONAL })] });

    const summary = await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary.created).toBe(1);
    // First in sort order wins, so a school override placed earlier decides.
    expect(prisma.caseDocument.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ ruleId: 'r1', necessity: Necessity.REQUIRED })],
    });
  });

  it('falls back to the client record when the case questionnaire is unanswered (1D-06)', async () => {
    const prisma = prismaStub({ rules: [], conditions: null });

    await new RequirementsService(prisma, casesStub()).resolveForCase('case-1', DocStage.ADMISSION);

    expect(prisma.requirementRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ educationLevels: { isEmpty: true } }, { educationLevels: { has: EducationLevel.BACHELOR } }] },
          ]),
        }),
      }),
    );
  });
});

/**
 * The checklist and the case stage are the same event seen twice: the material
 * list is what the prepayment buys, and building it is the start of collecting
 * it (gksedu.md §9).
 */
describe('RequirementsService.resolveForCase — stage coupling', () => {
  it('refuses to build the admission list before the prepayment is confirmed', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1')], stage: CaseStage.CONTRACT_SIGNED });
    const cases = casesStub();

    await expect(new RequirementsService(prisma, cases).resolveForCase('case-1', DocStage.ADMISSION)).rejects.toThrow(
      /Урьдчилгаа/,
    );
    expect(prisma.caseDocument.createMany).not.toHaveBeenCalled();
    expect(cases.applyDomainTransition).not.toHaveBeenCalled();
  });

  it('moves the case on to DOCUMENTS once the list is built', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1')] });
    const cases = casesStub();

    const summary = await new RequirementsService(prisma, cases).resolveForCase('case-1', DocStage.ADMISSION, 'staff-1');

    expect(summary.stageMoved).toBe(true);
    expect(cases.applyDomainTransition).toHaveBeenCalledWith(
      'case-1',
      CaseStage.DOCUMENTS,
      'staff-1',
      expect.any(String),
    );
  });

  it('never drags a case backwards when the list is re-resolved later on', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1')], stage: CaseStage.APPLICATION_SUBMITTED });
    const cases = casesStub();

    await new RequirementsService(prisma, cases).resolveForCase('case-1', DocStage.ADMISSION);

    expect(prisma.caseDocument.createMany).toHaveBeenCalled();
    expect(cases.applyDomainTransition).not.toHaveBeenCalled();
  });

  it('leaves the visa list alone — it is a later phase, not the one being opened', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1')], stage: CaseStage.VISA });
    const cases = casesStub();

    await new RequirementsService(prisma, cases).resolveForCase('case-1', DocStage.VISA);

    expect(cases.applyDomainTransition).not.toHaveBeenCalled();
  });
});
