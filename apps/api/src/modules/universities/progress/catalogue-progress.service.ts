import { Injectable } from '@nestjs/common';
import { Prisma, type ProgramLevel } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  scoreSchool,
  summarise,
  type IntakeAggregate,
  type ProgramAggregate,
} from './catalogue-progress.math.js';
import type {
  CatalogueActivityEntry,
  CatalogueProgress,
  CatalogueStaffActivity,
} from './catalogue-progress.types.js';

/**
 * Every audited write that fills the catalogue in. Ranking actions are left
 * out on purpose — reordering the list is not filling a school in.
 */
const CATALOGUE_ACTIONS = [
  'university.update',
  'program.create',
  'program.bulk-create',
  'program.update',
  'program.delete',
  'faculty.create',
  'faculty.update',
  'faculty.delete',
  'admission.intake.create',
  'admission.intake.bulk-create',
  'admission.intake.update',
  'admission.intake.delete',
  'admission.intake.override',
  'admission.intake.override.delete',
] as const;

type Bucket = keyof Pick<
  CatalogueStaffActivity,
  | 'programsCreated'
  | 'programsUpdated'
  | 'intakesCreated'
  | 'intakesUpdated'
  | 'facultiesChanged'
  | 'universitiesUpdated'
  | 'deleted'
>;

const ACTION_BUCKET: Record<(typeof CATALOGUE_ACTIONS)[number], Bucket> = {
  'university.update': 'universitiesUpdated',
  'program.create': 'programsCreated',
  'program.bulk-create': 'programsCreated',
  'program.update': 'programsUpdated',
  'program.delete': 'deleted',
  'faculty.create': 'facultiesChanged',
  'faculty.update': 'facultiesChanged',
  'faculty.delete': 'deleted',
  'admission.intake.create': 'intakesCreated',
  'admission.intake.bulk-create': 'intakesCreated',
  'admission.intake.update': 'intakesUpdated',
  'admission.intake.delete': 'deleted',
  'admission.intake.override': 'intakesUpdated',
  'admission.intake.override.delete': 'deleted',
};

/** A row timestamp this much newer than the last audit row was written by something unaudited. */
const UNAUDITED_TOLERANCE_MS = 5 * 60_000;
const RECENT_LIMIT = 40;
/** Bounds the period read; a year of one office's catalogue edits is far below it. */
const PERIOD_ROW_CAP = 20_000;

const UUID_RE = '^[0-9a-fA-F-]{36}$';

/**
 * Audit rows with the school each one touched.
 *
 * The log stores the entity, not the school, so the school is found through the
 * row the entity points at — and, for a bulk save or a row since deleted, off
 * the request body the interceptor kept. A delete whose body was empty stays
 * unattributed rather than guessed.
 */
const RESOLVED_AUDIT = Prisma.sql`
  SELECT
    l.id,
    l."createdAt" AS created_at,
    l.action,
    l."actorId" AS actor_id,
    COALESCE(NULLIF(btrim(usr.name), ''), usr.email, l."actorLabel", 'Систем') AS actor_name,
    COALESCE(usr.email, l."actorLabel") AS actor_email,
    COALESCE(
      p."universityId",
      f."universityId",
      it."universityId",
      oit."universityId",
      CASE WHEN l.entity = 'University' THEN l."entityId" END,
      CASE WHEN l.after->>'universityId' ~ ${UUID_RE} THEN (l.after->>'universityId')::uuid END,
      CASE
        WHEN jsonb_typeof(l.after->'intakes') = 'array'
         AND l.after->'intakes'->0->>'universityId' ~ ${UUID_RE}
        THEN (l.after->'intakes'->0->>'universityId')::uuid
      END
    ) AS university_id,
    (CASE
      WHEN jsonb_typeof(l.after->'programs') = 'array' THEN jsonb_array_length(l.after->'programs')
      WHEN jsonb_typeof(l.after->'intakes') = 'array' THEN jsonb_array_length(l.after->'intakes')
      ELSE 1
    END)::int AS n
  FROM "audit_logs" l
  LEFT JOIN "users" usr ON usr.id = l."actorId"
  LEFT JOIN "university_programs" p ON l.entity = 'UniversityProgram' AND p.id = l."entityId"
  LEFT JOIN "faculties" f ON l.entity = 'Faculty' AND f.id = l."entityId"
  LEFT JOIN "intake_terms" it ON l.entity = 'IntakeTerm' AND it.id = l."entityId"
  LEFT JOIN "intake_program_overrides" o ON l.entity = 'IntakeProgramOverride' AND o.id = l."entityId"
  LEFT JOIN "intake_terms" oit ON oit.id = o."intakeId"
  WHERE l.action IN (${Prisma.join([...CATALOGUE_ACTIONS])})
`;

interface ProgramSqlRow {
  university_id: string;
  level: ProgramLevel;
  total: number;
  with_tuition: number;
  with_scholarship: number;
  with_faculty: number;
  verified: number;
  last_at: Date | null;
}

interface IntakeSqlRow {
  university_id: string;
  level: ProgramLevel;
  total: number;
  upcoming: number;
  upcoming_verified: number;
  last_at: Date | null;
}

interface FacultySqlRow {
  university_id: string;
  total: number;
  last_at: Date | null;
}

interface AuditSqlRow {
  id: string;
  created_at: Date;
  action: (typeof CATALOGUE_ACTIONS)[number];
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  university_id: string | null;
  university_name: string | null;
  n: number;
}

interface CountSqlRow {
  actor_id: string;
  actor_name: string;
  actor_email: string | null;
  university_id: string | null;
  created_at: Date;
}

/**
 * 1A-43 — the office's progress filling in the catalogue, and who is doing it.
 *
 * Read-only and computed live on every request: a few GROUP BYs over a few
 * thousand rows, cheaper than keeping a cached copy honest.
 */
@Injectable()
export class CatalogueProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async build(periodDays: number): Promise<CatalogueProgress> {
    const since = new Date(Date.now() - periodDays * 86_400_000);

    // Read-only, so `Promise.all` rather than `$transaction` (CLAUDE.md rule 9).
    const [schools, programRows, intakeRows, facultyRows, lastTouches, periodRows, researchRows, verifiedRows] =
      await Promise.all([
        this.prisma.university.findMany({
          select: {
            id: true,
            slug: true,
            nameEn: true,
            nameMn: true,
            nameKo: true,
            logoPath: true,
            isPublished: true,
            acceptsLanguagePrep: true,
          },
          orderBy: { nameMn: 'asc' },
        }),
        this.prisma.$queryRaw<ProgramSqlRow[]>`
          SELECT
            "universityId" AS university_id,
            level::text AS level,
            count(*)::int AS total,
            count(*) FILTER (WHERE "tuitionPerTermKrw" IS NOT NULL OR "tuitionPerYearKrw" IS NOT NULL)::int AS with_tuition,
            count(*) FILTER (
              WHERE "scholarshipMaxPercent" IS NOT NULL OR NULLIF(btrim("scholarshipNote"), '') IS NOT NULL
            )::int AS with_scholarship,
            count("facultyId")::int AS with_faculty,
            count("verifiedAt")::int AS verified,
            max("updatedAt") AS last_at
          FROM "university_programs"
          GROUP BY 1, 2
        `,
        // "Upcoming" is a round the office can still register for: not
        // cancelled, and our own deadline not yet past (CLAUDE.md — every
        // count runs on the internal date). A round with no dates yet counts
        // by its year, so a half-entered row still shows up as started.
        this.prisma.$queryRaw<IntakeSqlRow[]>`
          SELECT
            university_id,
            level,
            count(*)::int AS total,
            count(*) FILTER (WHERE upcoming)::int AS upcoming,
            count(*) FILTER (WHERE upcoming AND verified)::int AS upcoming_verified,
            max(updated_at) AS last_at
          FROM (
            SELECT
              "universityId" AS university_id,
              level::text AS level,
              "updatedAt" AS updated_at,
              "verifiedAt" IS NOT NULL AS verified,
              status <> 'CANCELLED' AND (
                "internalDeadline" >= now()
                OR ("internalDeadline" IS NULL AND year >= extract(year FROM now()))
              ) AS upcoming
            FROM "intake_terms"
          ) t
          GROUP BY 1, 2
        `,
        this.prisma.$queryRaw<FacultySqlRow[]>`
          SELECT "universityId" AS university_id, count(*)::int AS total, max("updatedAt") AS last_at
          FROM "faculties"
          GROUP BY 1
        `,
        this.prisma.$queryRaw<{ university_id: string; created_at: Date; actor_name: string }[]>`
          SELECT DISTINCT ON (university_id) university_id, created_at, actor_name
          FROM (${RESOLVED_AUDIT}) a
          WHERE university_id IS NOT NULL
          ORDER BY university_id, created_at DESC
        `,
        this.prisma.$queryRaw<AuditSqlRow[]>`
          SELECT a.*, un."nameMn" AS university_name
          FROM (${RESOLVED_AUDIT}) a
          LEFT JOIN "universities" un ON un.id = a.university_id
          WHERE a.created_at >= ${since}
          ORDER BY a.created_at DESC
          LIMIT ${PERIOD_ROW_CAP}
        `,
        // Research runs are logged in their own tables with the school on the
        // row, so they are read there rather than through the audit log.
        this.prisma.$queryRaw<CountSqlRow[]>`
          SELECT r."requestedById" AS actor_id,
                 COALESCE(NULLIF(btrim(usr.name), ''), usr.email) AS actor_name,
                 usr.email AS actor_email,
                 r."universityId" AS university_id,
                 r."createdAt" AS created_at
          FROM (
            SELECT "requestedById", "universityId", "createdAt" FROM "program_research_runs"
            UNION ALL
            SELECT "requestedById", "universityId", "createdAt" FROM "intake_research_runs"
          ) r
          JOIN "users" usr ON usr.id = r."requestedById"
          WHERE r."createdAt" >= ${since}
        `,
        this.prisma.$queryRaw<CountSqlRow[]>`
          SELECT v."verifiedById" AS actor_id,
                 COALESCE(NULLIF(btrim(usr.name), ''), usr.email) AS actor_name,
                 usr.email AS actor_email,
                 v."universityId" AS university_id,
                 v."verifiedAt" AS created_at
          FROM (
            SELECT "verifiedById", "universityId", "verifiedAt" FROM "university_programs"
            UNION ALL
            SELECT "verifiedById", "universityId", "verifiedAt" FROM "intake_terms"
          ) v
          JOIN "users" usr ON usr.id = v."verifiedById"
          WHERE v."verifiedAt" >= ${since}
        `,
      ]);

    const programsBySchool = groupBy(programRows, (row) => row.university_id);
    const intakesBySchool = groupBy(intakeRows, (row) => row.university_id);
    const facultiesBySchool = new Map(facultyRows.map((row) => [row.university_id, row]));
    const touchBySchool = new Map(lastTouches.map((row) => [row.university_id, row]));

    const rows = schools.map((school) => {
      const programs = programsBySchool.get(school.id) ?? [];
      const intakes = intakesBySchool.get(school.id) ?? [];
      const faculty = facultiesBySchool.get(school.id);
      const touch = touchBySchool.get(school.id);

      const rowsAt = latest([...programs.map((row) => row.last_at), ...intakes.map((row) => row.last_at), faculty?.last_at]);
      // The audit row names who; a row timestamp clearly newer than it was
      // written by something that is not audited (an importer, an older build)
      // and is shown without a name rather than credited to the last person.
      const audited = touch && (!rowsAt || touch.created_at.getTime() >= rowsAt.getTime() - UNAUDITED_TOLERANCE_MS);
      const lastActivityAt = latest([touch?.created_at, rowsAt]);

      return scoreSchool({
        ...school,
        faculties: faculty?.total ?? 0,
        programs: programs.map(
          (row): ProgramAggregate => ({
            level: row.level,
            total: row.total,
            withTuition: row.with_tuition,
            withScholarship: row.with_scholarship,
            withFaculty: row.with_faculty,
            verified: row.verified,
          }),
        ),
        intakes: intakes.map(
          (row): IntakeAggregate => ({
            level: row.level,
            total: row.total,
            upcoming: row.upcoming,
            upcomingVerified: row.upcoming_verified,
          }),
        ),
        lastActivityAt,
        lastActivityBy: audited ? touch.actor_name : null,
      });
    });

    return {
      generatedAt: new Date().toISOString(),
      periodDays,
      summary: summarise(rows),
      rows,
      staff: this.staffActivity(periodRows, researchRows, verifiedRows),
      recent: periodRows.slice(0, RECENT_LIMIT).map(
        (row): CatalogueActivityEntry => ({
          id: row.id,
          at: row.created_at.toISOString(),
          actorName: row.actor_name,
          action: row.action,
          count: row.n,
          university: row.university_id && row.university_name ? { id: row.university_id, nameMn: row.university_name } : null,
        }),
      ),
    };
  }

  private staffActivity(
    auditRows: AuditSqlRow[],
    researchRows: CountSqlRow[],
    verifiedRows: CountSqlRow[],
  ): CatalogueStaffActivity[] {
    const byActor = new Map<string, CatalogueStaffActivity & { schools: Set<string> }>();

    const entry = (actorId: string | null, name: string, email: string | null) => {
      const key = actorId ?? `label:${name}`;
      let current = byActor.get(key);
      if (!current) {
        current = {
          actorId,
          name,
          email,
          programsCreated: 0,
          programsUpdated: 0,
          intakesCreated: 0,
          intakesUpdated: 0,
          facultiesChanged: 0,
          universitiesUpdated: 0,
          deleted: 0,
          researchRuns: 0,
          verified: 0,
          schoolsTouched: 0,
          lastActiveAt: null,
          schools: new Set(),
        };
        byActor.set(key, current);
      }
      return current;
    };

    const touch = (row: { created_at: Date; university_id: string | null }, target: ReturnType<typeof entry>) => {
      if (row.university_id) target.schools.add(row.university_id);
      const at = row.created_at.toISOString();
      if (!target.lastActiveAt || at > target.lastActiveAt) target.lastActiveAt = at;
    };

    for (const row of auditRows) {
      const target = entry(row.actor_id, row.actor_name, row.actor_email);
      target[ACTION_BUCKET[row.action]] += row.n;
      touch(row, target);
    }
    for (const row of researchRows) {
      const target = entry(row.actor_id, row.actor_name, row.actor_email);
      target.researchRuns += 1;
      touch(row, target);
    }
    for (const row of verifiedRows) {
      const target = entry(row.actor_id, row.actor_name, row.actor_email);
      target.verified += 1;
      touch(row, target);
    }

    return [...byActor.values()]
      .map(({ schools, ...rest }) => ({ ...rest, schoolsTouched: schools.size }))
      .sort((a, b) => b.schoolsTouched - a.schoolsTouched || (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''));
  }
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(key(row));
    if (bucket) bucket.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

function latest(dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const date of dates) if (date && (!best || date > best)) best = date;
  return best;
}
