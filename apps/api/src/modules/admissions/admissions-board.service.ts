import { Injectable } from '@nestjs/common';
import { CaseStage, IntakeStatus, Necessity, Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import { AdmissionConfigService } from './admission-config.service.js';
import { computeIntakePhase, daysUntil, resolveIntakeDates } from './intake-deadline.js';

/** Stages where an intake deadline no longer bites — the case is past it or gone. */
const SETTLED_STAGES: CaseStage[] = [
  CaseStage.DEPARTED,
  CaseStage.COMPLETED,
  CaseStage.CANCELLED,
  CaseStage.REJECTED,
  CaseStage.ON_HOLD,
];

const BOARD_CASE_SELECT = {
  id: true,
  code: true,
  stage: true,
  serviceType: true,
  intakeId: true,
  // The programme decides which calendar this case is actually racing: one on
  // its own override closes on its own date (§3.2).
  programId: true,
  user: { select: { name: true, client: { select: { lastName: true, firstName: true } } } },
  assignedConsultant: { select: { id: true, name: true } },
  assignedDocOfficer: { select: { id: true, name: true } },
  documents: {
    where: { deletedAt: null, necessity: Necessity.REQUIRED },
    select: { status: true },
  },
} satisfies Prisma.CaseSelect;

type BoardCaseRow = Prisma.CaseGetPayload<{ select: typeof BOARD_CASE_SELECT }>;

/**
 * The intake board (1H-08) — the screen that answers "who is about to miss
 * their round?".
 *
 * This is the direct answer to the two failures the office described: a
 * consultant forgetting to register a client at all, and a client whose
 * documents are still short while the deadline closes in. Both are invisible
 * on a per-case screen and obvious when the cases are lined up under the date
 * they are all racing.
 */
@Injectable()
export class AdmissionsBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AdmissionConfigService,
  ) {}

  /** Every live intake with the cases riding on it, soonest deadline first. */
  async board(options: { universityId?: string; assigneeId?: string; onlyAtRisk?: boolean } = {}) {
    const now = new Date();
    const threshold = (await this.config.get()).riskReadinessThreshold;

    const cases = await this.prisma.case.findMany({
      where: {
        intakeId: { not: null },
        stage: { notIn: SETTLED_STAGES },
        ...(options.universityId ? { universityId: options.universityId } : {}),
        ...(options.assigneeId
          ? { OR: [{ assignedConsultantId: options.assigneeId }, { assignedDocOfficerId: options.assigneeId }] }
          : {}),
      },
      select: BOARD_CASE_SELECT,
    });

    if (!cases.length) return [];

    const intakeIds = [...new Set(cases.map((row) => row.intakeId as string))];
    const [intakes, overrides] = await Promise.all([
      this.prisma.intakeTerm.findMany({
        where: { id: { in: intakeIds } },
        select: {
          id: true,
          universityId: true,
          level: true,
          year: true,
          month: true,
          openAt: true,
          applicationDeadline: true,
          internalDeadline: true,
          internalDeadlineIsManual: true,
          classStartDate: true,
          quota: true,
          admissionFeeKrw: true,
          requirementNote: true,
          note: true,
          status: true,
          university: { select: { id: true, slug: true, nameMn: true, nameEn: true, logoPath: true, cityMn: true } },
        },
      }),
      this.prisma.intakeProgramOverride.findMany({
        where: { intakeId: { in: intakeIds } },
        select: {
          intakeId: true,
          programId: true,
          openAt: true,
          applicationDeadline: true,
          internalDeadline: true,
          internalDeadlineIsManual: true,
          classStartDate: true,
        },
      }),
    ]);

    const overrideOf = new Map(overrides.map((row) => [`${row.intakeId}:${row.programId}`, row]));

    const groups = intakes.map((intake) => {
      const daysLeft = daysUntil(intake.internalDeadline, now);
      const rows = cases
        .filter((row) => row.intakeId === intake.id)
        .map((row) => {
          // Per case, not per round: the header is the round's own deadline,
          // but a case on a programme with its own calendar is counting down
          // to that one, and the intake-risk report already flags it on it.
          const override = row.programId ? overrideOf.get(`${intake.id}:${row.programId}`) : undefined;
          const dates = resolveIntakeDates(intake, override ?? null);
          return this.toBoardCase(row, daysUntil(dates.internalDeadline, now), threshold);
        })
        .filter((row) => !options.onlyAtRisk || row.atRisk)
        // Least prepared first — the board exists to surface those.
        .sort((a, b) => a.readiness - b.readiness);

      return {
        intake: {
          ...intake,
          phase: computeIntakePhase(intake, intake.status, now),
          daysUntilInternalDeadline: daysLeft,
        },
        cases: rows,
        atRiskCount: rows.filter((row) => row.atRisk).length,
      };
    });

    return groups
      .filter((group) => group.cases.length > 0)
      .sort((a, b) => {
        const left = a.intake.daysUntilInternalDeadline;
        const right = b.intake.daysUntilInternalDeadline;
        // A round with no deadline recorded is not urgent — it is unknown, and
        // it sorts last rather than first.
        if (left === null) return right === null ? 0 : 1;
        if (right === null) return -1;
        return left - right;
      });
  }

  /** The flat at-risk list, for the dashboard tile and the staff reminder. */
  async atRisk(assigneeId?: string) {
    const groups = await this.board({ assigneeId, onlyAtRisk: true });
    return groups.flatMap((group) => group.cases);
  }

  private toBoardCase(row: BoardCaseRow, daysLeft: number | null, threshold: number) {
    const required = row.documents.length;
    const approved = row.documents.filter((doc) => SETTLED_STATUSES.includes(doc.status)).length;
    // A case with no document list yet reads as 0% ready, not 100% — nothing
    // has been collected, and rounding it up would hide exactly the cases the
    // board is for.
    const readiness = required ? Math.round((approved / required) * 100) : 0;

    const client = row.user.client;
    const clientName = client ? `${client.lastName} ${client.firstName}` : (row.user.name ?? '—');

    return {
      caseId: row.id,
      code: row.code,
      stage: row.stage,
      clientName,
      serviceType: row.serviceType,
      readiness,
      requiredDocuments: required,
      approvedDocuments: approved,
      missingDocuments: required - approved,
      daysUntilInternalDeadline: daysLeft,
      // Only once the deadline is actually in sight: a 40%-ready case six
      // months out is normal, the same case ten days out is the problem.
      atRisk: daysLeft !== null && daysLeft <= 30 && readiness < threshold,
      assignedConsultant: row.assignedConsultant,
      assignedDocOfficer: row.assignedDocOfficer,
    };
  }

  /** Counters for the admin dashboard header. */
  async stats() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [openIntakes, closingSoon, missingDates, atRisk] = await Promise.all([
      this.prisma.intakeTerm.count({ where: { status: IntakeStatus.OPEN } }),
      this.prisma.intakeTerm.count({
        where: { status: IntakeStatus.OPEN, internalDeadline: { gte: now, lte: horizon } },
      }),
      this.prisma.intakeTerm.count({ where: { status: IntakeStatus.OPEN, applicationDeadline: null } }),
      this.atRisk().then((rows) => rows.length),
    ]);

    return { openIntakes, closingSoon, missingDates, atRisk };
  }
}
