import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntakeStatus, ProgramLevel, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CacheService } from '../../redis/cache.service.js';
import type { AdmissionConfigService } from './admission-config.service.js';
import { AdmissionsService } from './admissions.service.js';
import type { CreateIntakeTermDto } from './dto/intake-term.dto.js';

/**
 * The calendar's Prisma double.
 *
 * Only the tables the paths under test touch, and every one of them records
 * what it was asked — half of what these tests assert is the `where` the
 * service built, because that is where the "still open" and "which deadline"
 * rules actually live.
 */
const SNU = '11111111-1111-4111-8111-111111111111';
const INTAKE = '22222222-2222-4222-8222-222222222222';
const PROGRAM = '33333333-3333-4333-8333-333333333333';

const day = (value: string) => new Date(`${value}T23:59:59.999Z`);

/** A March 2027 round: the school closes 31 Jan, we close 24 Jan. */
function termRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTAKE,
    universityId: SNU,
    level: ProgramLevel.BACHELOR,
    year: 2027,
    month: 3,
    openAt: null,
    applicationDeadline: day('2027-01-31'),
    internalDeadline: day('2027-01-24'),
    internalDeadlineIsManual: false,
    classStartDate: null,
    resultAnnouncedAt: null,
    quota: null,
    admissionFeeKrw: null,
    requirementNote: null,
    status: IntakeStatus.OPEN,
    note: null,
    sourceUrl: null,
    sourceType: 'MANUAL',
    verifiedAt: null,
    university: { slug: 'seoul-national-university' },
    ...overrides,
  };
}

function stub(options: {
  term?: Record<string, unknown> | null;
  overrides?: Record<string, unknown>[];
  groups?: { year: number; month: number; _count: { _all: number }; _min: Record<string, Date | null> }[];
  existingIntakes?: Record<string, unknown>[];
  caseRow?: Record<string, unknown> | null;
} = {}) {
  const prisma = {
    intakeTerm: {
      findUnique: vi.fn().mockResolvedValue(options.term === undefined ? termRow() : options.term),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(options.existingIntakes ?? []),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue(options.groups ?? []),
      create: vi.fn(),
    },
    intakeProgramOverride: {
      findUnique: vi.fn().mockResolvedValue(options.overrides?.[0] ?? null),
      findMany: vi.fn().mockResolvedValue(options.overrides ?? []),
      upsert: vi.fn().mockImplementation(({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({ id: 'override-1', quota: null, note: null, program: { nameMn: 'Мэдээллийн технологи' }, ...create }),
      ),
    },
    universityProgram: { findFirst: vi.fn().mockResolvedValue({ id: PROGRAM }) },
    university: { findUnique: vi.fn().mockResolvedValue({ id: SNU, slug: 'seoul-national-university' }) },
    case: { findUnique: vi.fn().mockResolvedValue(options.caseRow ?? null) },
    caseDocument: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: vi.fn().mockReturnValueOnce(3).mockReturnValueOnce(2),
    $transaction: vi.fn().mockImplementation((arg: unknown) => Promise.all(arg as unknown[])),
  };

  const cache = {
    wrap: vi.fn().mockImplementation((_key: string, factory: () => unknown) => factory()),
    del: vi.fn(),
    delByPattern: vi.fn(),
  };

  const config = {
    getInternalLeadDays: vi.fn().mockResolvedValue(7),
    get: vi.fn().mockResolvedValue({ riskReadinessThreshold: 60 }),
  };

  const service = new AdmissionsService(
    prisma as unknown as PrismaService,
    cache as unknown as CacheService,
    config as unknown as AdmissionConfigService,
  );

  return { service, prisma, cache, config };
}

/* ---------------------------------------------------------------------- *
 * 1N-32 — a round with no dates does not stay open forever
 * ---------------------------------------------------------------------- */

describe('AdmissionsService — undated rounds are floored (1N-32)', () => {
  it('only calls a round with no deadline open while its own month is still ahead', async () => {
    const { service, prisma } = stub();
    await service.selectableForUniversity(SNU);

    const where = prisma.intakeTerm.findMany.mock.calls[0]?.[0].where as {
      OR: { internalDeadline: unknown; AND?: unknown[] }[];
    };
    const undated = where.OR.find((branch) => branch.internalDeadline === null);

    // Without this the March 2026 round somebody entered without dates is
    // still selectable in 2027, and still answers the planner.
    expect(undated?.AND).toBeDefined();
    expect(JSON.stringify(undated?.AND)).toContain('classStartDate');
    expect(JSON.stringify(undated?.AND)).toContain('year');
  });

  it('never answers the planner with a month that has already begun', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
    try {
      const { service } = stub({
        groups: [
          // An undated round from last March, still OPEN in the table.
          { year: 2026, month: 3, _count: { _all: 1 }, _min: { internalDeadline: null, classStartDate: null } },
          { year: 2026, month: 12, _count: { _all: 4 }, _min: { internalDeadline: day('2026-10-31'), classStartDate: null } },
        ],
      });

      const answer = await service.earliestOpenMonth(ProgramLevel.LANGUAGE_PREP);
      expect(answer).toMatchObject({ year: 2026, month: 12 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the month that is running right now — it has not passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
    try {
      const { service } = stub({
        groups: [{ year: 2026, month: 9, _count: { _all: 2 }, _min: { internalDeadline: null, classStartDate: null } }],
      });
      expect(await service.earliestOpenMonth(ProgramLevel.LANGUAGE_PREP)).toMatchObject({ year: 2026, month: 9 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('still honours an explicit floor on top of it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T00:00:00.000Z'));
    try {
      const { service } = stub({
        groups: [
          { year: 2026, month: 12, _count: { _all: 4 }, _min: { internalDeadline: null, classStartDate: null } },
          { year: 2027, month: 3, _count: { _all: 6 }, _min: { internalDeadline: null, classStartDate: null } },
        ],
      });

      const answer = await service.earliestOpenMonth(ProgramLevel.BACHELOR, {
        notBefore: new Date('2027-01-10T00:00:00.000Z'),
      });
      expect(answer).toMatchObject({ year: 2027, month: 3 });
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ---------------------------------------------------------------------- *
 * 1N-28 — a programme on its own calendar runs to its own dates
 * ---------------------------------------------------------------------- */

const override = (patch: Record<string, unknown> = {}) => ({
  programId: PROGRAM,
  openAt: null,
  applicationDeadline: day('2026-12-15'),
  internalDeadline: day('2026-12-08'),
  internalDeadlineIsManual: false,
  classStartDate: null,
  ...patch,
});

describe('AdmissionsService — programme overrides reach the cases (1N-28)', () => {
  it("gives a case on an overridden programme the override's deadline", async () => {
    const { service, prisma } = stub({
      overrides: [override()],
      caseRow: { intakeId: INTAKE, programId: PROGRAM, intake: termRow() },
    });

    await service.applyDeadlineToCase('case-1');
    expect(prisma.caseDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dueAt: day('2026-12-08') } }),
    );
  });

  it("leaves a case on any other programme on the term's deadline", async () => {
    const { service, prisma } = stub({
      overrides: [],
      caseRow: { intakeId: INTAKE, programId: null, intake: termRow() },
    });

    await service.applyDeadlineToCase('case-1');
    expect(prisma.caseDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { dueAt: day('2027-01-24') } }),
    );
  });

  it('splits a round into one update per calendar rather than one for all of it', async () => {
    const { service, prisma } = stub({ overrides: [override()] });
    await service.applyDeadlineToCases(INTAKE);

    const writes = prisma.caseDocument.updateMany.mock.calls.map(([args]) => args as {
      where: { case: { programId?: unknown } };
      data: { dueAt: Date };
    });

    expect(writes).toHaveLength(2);
    // Everyone not on the overridden programme.
    expect(writes[0]?.data.dueAt).toEqual(day('2027-01-24'));
    expect(JSON.stringify(writes[0]?.where.case)).toContain('notIn');
    // The overridden programme, on its own date.
    expect(writes[1]?.data.dueAt).toEqual(day('2026-12-08'));
    expect(writes[1]?.where.case.programId).toBe(PROGRAM);
  });

  it('refuses a round whose override has closed even though the term is open', async () => {
    const { service } = stub({
      overrides: [override({ applicationDeadline: day('2026-11-30'), internalDeadline: day('2026-11-23') })],
    });

    await expect(
      service.assertSelectable(INTAKE, SNU, ServiceType.BACHELOR, new Date('2026-12-20T00:00:00.000Z'), PROGRAM),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The same round, for a programme running to the term's calendar, is fine.
    const open = stub({ overrides: [] });
    await expect(
      open.service.assertSelectable(INTAKE, SNU, ServiceType.BACHELOR, new Date('2026-12-20T00:00:00.000Z'), null),
    ).resolves.toBeTruthy();
  });

  it('stores no internal deadline on an override that carries no dates of its own', async () => {
    const { service, prisma } = stub({ overrides: [] });
    await service.upsertOverride(INTAKE, { programId: PROGRAM });

    const written = prisma.intakeProgramOverride.upsert.mock.calls[0]?.[0].update as {
      internalDeadline: Date | null;
      internalDeadlineIsManual: boolean;
    };
    // A copy of the term's date here is a snapshot nothing recomputes — it
    // would silently win over the term the next time either date moves.
    expect(written.internalDeadline).toBeNull();
    expect(written.internalDeadlineIsManual).toBe(false);
  });

  it("derives one from the override's own school deadline when it has one", async () => {
    const { service, prisma } = stub({ overrides: [] });
    await service.upsertOverride(INTAKE, { programId: PROGRAM, applicationDeadline: '2026-12-15' });

    const written = prisma.intakeProgramOverride.upsert.mock.calls[0]?.[0].update as { internalDeadline: Date | null };
    expect(written.internalDeadline).toEqual(day('2026-12-08'));
  });

  it('re-applies the deadline to that programme after the override is written', async () => {
    const { service, prisma } = stub({ overrides: [override()] });
    await service.upsertOverride(INTAKE, { programId: PROGRAM });

    expect(prisma.caseDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ case: { intakeId: INTAKE, programId: PROGRAM } }) }),
    );
  });
});

/* ---------------------------------------------------------------------- *
 * 1N-35 — the lead-time recompute, and the duplicate rounds
 * ---------------------------------------------------------------------- */

describe('AdmissionsService.recomputeInternalDeadlines (1N-35)', () => {
  it('rewrites the whole catalogue in one atomic pair of statements', async () => {
    const { service, prisma, cache } = stub();
    const changed = await service.recomputeInternalDeadlines();

    // One per table, both inside the same transaction: a per-row loop over
    // ~1,000 rounds at ~115 ms each left half the catalogue behind on a timeout.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(changed).toBe(5);
    // The overrides run to the same rule and were left out of it entirely.
    expect(String(prisma.$executeRaw.mock.calls[1]?.[0])).toContain('intake_program_overrides');
    expect(cache.delByPattern).toHaveBeenCalledWith('universities:list:*');
  });
});

describe('AdmissionsService.createMany (1N-35)', () => {
  const intake = (month: number): CreateIntakeTermDto =>
    ({ universityId: SNU, level: ProgramLevel.BACHELOR, year: 2027, month }) as CreateIntakeTermDto;

  beforeEach(() => vi.clearAllMocks());

  it('refuses a batch that repeats a round inside itself', async () => {
    const { service } = stub();
    await expect(service.createMany({ intakes: [intake(3), intake(3)] }, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a batch repeating a round already in the table', async () => {
    const { service } = stub({
      existingIntakes: [{ universityId: SNU, level: ProgramLevel.BACHELOR, year: 2027, month: 9 }],
    });
    await expect(service.createMany({ intakes: [intake(3), intake(9)] }, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('writes nothing when the check trips', async () => {
    const { service, prisma } = stub();
    await service.createMany({ intakes: [intake(3), intake(3)] }, null).catch(() => undefined);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
