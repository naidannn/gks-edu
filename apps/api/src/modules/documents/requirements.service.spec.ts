import { describe, expect, it, vi } from 'vitest';
import {
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
import { buildRuleWhere, type ResolutionContext, RequirementsService } from './requirements.service.js';

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

function prismaStub(options: {
  rules: ReturnType<typeof rule>[];
  existing?: Record<string, unknown>[];
  conditions?: Record<string, unknown> | null;
}) {
  const prisma = {
    case: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'case-1',
        serviceType: ServiceType.BACHELOR,
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
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

describe('RequirementsService.resolveForCase (1D-04)', () => {
  it('creates one CaseDocument per matched rule', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1'), rule('r2', 't2')] });

    const summary = await new RequirementsService(prisma).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary).toMatchObject({ created: 2, updated: 0, removed: 0 });
    expect(prisma.caseDocument.create).toHaveBeenCalledTimes(2);
  });

  it('keeps a submitted document that no longer matches, and drops an untouched one (§7.1)', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1')],
      existing: [
        { id: 'd1', templateId: 't1', status: DocumentStatus.SUBMITTED, deletedAt: null },
        { id: 'd2', templateId: 't-gone', status: DocumentStatus.SUBMITTED, deletedAt: null },
        { id: 'd3', templateId: 't-unused', status: DocumentStatus.NOT_STARTED, deletedAt: null },
      ],
    });

    const summary = await new RequirementsService(prisma).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary).toMatchObject({ created: 0, updated: 1, removed: 1, keptDespiteUnmatched: 1 });
    expect(prisma.caseDocument.update).toHaveBeenCalledWith({
      where: { id: 'd3' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('restores a previously dropped document when its rule matches again', async () => {
    const prisma = prismaStub({
      rules: [rule('r1', 't1')],
      existing: [{ id: 'd1', templateId: 't1', status: DocumentStatus.NOT_STARTED, deletedAt: new Date() }],
    });

    await new RequirementsService(prisma).resolveForCase('case-1', DocStage.ADMISSION);

    expect(prisma.caseDocument.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ deletedAt: null }),
    });
  });

  it('lists a template once even when two rules name it', async () => {
    const prisma = prismaStub({ rules: [rule('r1', 't1'), rule('r2', 't1', { necessity: Necessity.OPTIONAL })] });

    const summary = await new RequirementsService(prisma).resolveForCase('case-1', DocStage.ADMISSION);

    expect(summary.created).toBe(1);
    // First in sort order wins, so a school override placed earlier decides.
    expect(prisma.caseDocument.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ruleId: 'r1', necessity: Necessity.REQUIRED }),
    });
  });

  it('falls back to the client record when the case questionnaire is unanswered (1D-06)', async () => {
    const prisma = prismaStub({ rules: [], conditions: null });

    await new RequirementsService(prisma).resolveForCase('case-1', DocStage.ADMISSION);

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
