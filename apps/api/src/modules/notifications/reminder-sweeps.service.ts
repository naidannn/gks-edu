import { Injectable, Logger } from '@nestjs/common';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import {
  CaseStage,
  DocumentStatus,
  IntakeStatus,
  LeadStage,
  Necessity,
  NotificationEvent,
  PaymentStatus,
  Role,
  VisaStatus,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdmissionConfigService } from '../admissions/admission-config.service.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import {
  LEAD_STAGE_LABELS,
  PAYMENT_KIND_LABELS,
  VISA_TYPE_LABELS,
  formatAmountMn,
  formatDateMn,
} from './notification-labels.js';
import { NotificationsService } from './notifications.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days before each deadline that the sweep raises a notification. */
const DOCUMENT_OFFSETS = [7, 3, 1] as const;
const PAYMENT_OFFSETS = [3, 0] as const;
const VISA_APPOINTMENT_OFFSETS = [3, 1] as const;
const DEPARTURE_OFFSETS = [14, 7, 1] as const;
const VISA_RENEWAL_OFFSETS = [30, 14] as const;

/** Cases past their intake, or gone — the calendar no longer applies to them. */
const INTAKE_SETTLED_STAGES = [
  CaseStage.APPLICATION_SUBMITTED,
  CaseStage.ADMITTED,
  CaseStage.TUITION_INVOICED,
  CaseStage.INVITATION_RECEIVED,
  CaseStage.GKS_ROUND1_PASSED,
  CaseStage.GKS_ROUND2_PASSED,
  CaseStage.VISA,
  CaseStage.VISA_APPROVED,
  CaseStage.BALANCE_PAID,
  CaseStage.COLLATERAL_CONTRACT,
  CaseStage.PRE_DEPARTURE,
  CaseStage.DEPARTED,
  CaseStage.COMPLETED,
  CaseStage.ON_HOLD,
  CaseStage.CANCELLED,
  CaseStage.REJECTED,
];

/** Mongolian name of an intake round, for the notification body. */
function intakeName(year: number, month: number): string {
  return `${year} оны ${month}-р сарын элсэлт`;
}

export interface SweepResult {
  documents: number;
  payments: number;
  visaAppointments: number;
  visaRenewals: number;
  departures: number;
  followUps: number;
  /** 1H-09 — to the client: their round is closing. */
  intakeDeadlines: number;
  /** 1H-09 — to the assigned staff: this case will miss it. */
  atRiskCases: number;
}

/**
 * 1G-07 — the scheduled half of §16. Runs once a day and is safe to run more
 * often: every notification carries a `dedupeSubject`, so a repeat sweep
 * collides on the unique `dedupeKey` instead of sending twice.
 *
 * Deciding *what* is due lives here; delivery is the dispatcher's job.
 */
@Injectable()
export class ReminderSweepsService {
  private readonly logger = new Logger(ReminderSweepsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly admissionConfig: AdmissionConfigService,
  ) {}

  async sweepAll(now: Date = new Date()): Promise<SweepResult> {
    const result: SweepResult = {
      documents: await this.sweepDocuments(now),
      payments: await this.sweepPayments(now),
      visaAppointments: await this.sweepVisaAppointments(now),
      visaRenewals: await this.sweepVisaRenewals(now),
      departures: await this.sweepDepartures(now),
      followUps: await this.sweepLeadFollowUps(now),
      intakeDeadlines: await this.sweepIntakeDeadlines(now),
      atRiskCases: await this.sweepAtRiskCases(now),
    };

    const total = Object.values(result).reduce((sum, count) => sum + count, 0);
    if (total) this.logger.log(`Хуваарьт сануулга: ${JSON.stringify(result)}`);
    return result;
  }

  /** §16 "Материалын хугацаа дөхсөн" — pairs with the `DocumentReminder` rows of 1D-12. */
  private async sweepDocuments(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...DOCUMENT_OFFSETS) * DAY_MS);

    const due = await this.prisma.caseDocument.findMany({
      where: {
        deletedAt: null,
        necessity: Necessity.REQUIRED,
        dueAt: { not: null, lte: horizon },
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
      },
      select: {
        id: true,
        dueAt: true,
        template: { select: { nameMn: true } },
        case: { select: { id: true, code: true, userId: true } },
      },
    });

    let sent = 0;
    for (const doc of due) {
      if (!doc.dueAt) continue;
      const daysLeft = Math.ceil((doc.dueAt.getTime() - now.getTime()) / DAY_MS);
      const offset = DOCUMENT_OFFSETS.find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.DOCUMENT_DEADLINE_NEAR,
        userIds: [doc.case.userId],
        caseId: doc.case.id,
        dedupeSubject: `${doc.id}:${offset}`,
        context: {
          documentName: doc.template?.nameMn ?? 'Материал',
          dueDate: formatDateMn(doc.dueAt),
          daysLeft: Math.max(daysLeft, 0),
          caseCode: doc.case.code,
          caseId: doc.case.id,
        },
      });
    }
    return sent;
  }

  /** §16 "Төлбөрийн хугацаа болсон". */
  private async sweepPayments(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...PAYMENT_OFFSETS) * DAY_MS);

    const due = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, dueAt: { not: null, lte: horizon } },
      select: {
        id: true,
        kind: true,
        amountMnt: true,
        dueAt: true,
        case: { select: { id: true, code: true, userId: true } },
      },
    });

    let sent = 0;
    for (const payment of due) {
      if (!payment.dueAt) continue;
      const daysLeft = Math.ceil((payment.dueAt.getTime() - now.getTime()) / DAY_MS);
      const offset = PAYMENT_OFFSETS.find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.PAYMENT_DUE,
        userIds: [payment.case.userId],
        caseId: payment.case.id,
        dedupeSubject: `${payment.id}:${offset}`,
        context: {
          paymentKindName: PAYMENT_KIND_LABELS[payment.kind],
          amount: formatAmountMn(payment.amountMnt),
          dueDate: formatDateMn(payment.dueAt),
          daysLeft: Math.max(daysLeft, 0),
          caseCode: payment.case.code,
          caseId: payment.case.id,
        },
      });
    }
    return sent;
  }

  /** §16 "Виз мэдүүлэх өдөр болсон". */
  private async sweepVisaAppointments(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...VISA_APPOINTMENT_OFFSETS) * DAY_MS);

    const upcoming = await this.prisma.visaCase.findMany({
      where: {
        appointmentAt: { not: null, gte: startOfDay(now), lte: horizon },
        status: { notIn: [VisaStatus.APPROVED, VisaStatus.REJECTED] },
      },
      select: {
        id: true,
        appointmentAt: true,
        visaType: true,
        case: { select: { id: true, code: true, userId: true } },
      },
    });

    let sent = 0;
    for (const visa of upcoming) {
      if (!visa.appointmentAt) continue;
      const daysLeft = Math.ceil((visa.appointmentAt.getTime() - now.getTime()) / DAY_MS);
      const offset = VISA_APPOINTMENT_OFFSETS.find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.VISA_APPOINTMENT_DUE,
        userIds: [visa.case.userId],
        caseId: visa.case.id,
        dedupeSubject: `${visa.id}:${offset}`,
        context: {
          appointmentDate: formatDateMn(visa.appointmentAt),
          visaTypeName: VISA_TYPE_LABELS[visa.visaType],
          daysLeft: Math.max(daysLeft, 0),
          caseCode: visa.case.code,
          caseId: visa.case.id,
        },
      });
    }
    return sent;
  }

  /** §16 "Виз сунгах хугацаа дөхсөн" — the one reminder that fires after departure. */
  private async sweepVisaRenewals(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...VISA_RENEWAL_OFFSETS) * DAY_MS);

    const expiring = await this.prisma.visaCase.findMany({
      where: { status: VisaStatus.APPROVED, expiresAt: { not: null, gte: now, lte: horizon } },
      select: { id: true, expiresAt: true, case: { select: { id: true, code: true, userId: true } } },
    });

    let sent = 0;
    for (const visa of expiring) {
      if (!visa.expiresAt) continue;
      const daysLeft = Math.ceil((visa.expiresAt.getTime() - now.getTime()) / DAY_MS);
      const offset = VISA_RENEWAL_OFFSETS.find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.VISA_RENEWAL_NEAR,
        userIds: [visa.case.userId],
        caseId: visa.case.id,
        dedupeSubject: `${visa.id}:${offset}`,
        context: {
          expiryDate: formatDateMn(visa.expiresAt),
          daysLeft: Math.max(daysLeft, 0),
          caseCode: visa.case.code,
          caseId: visa.case.id,
        },
      });
    }
    return sent;
  }

  /** §16 "Явах өдөр дөхсөн". */
  private async sweepDepartures(now: Date): Promise<number> {
    const horizon = new Date(now.getTime() + Math.max(...DEPARTURE_OFFSETS) * DAY_MS);

    const upcoming = await this.prisma.departurePlan.findMany({
      where: { departureAt: { not: null, gte: startOfDay(now), lte: horizon } },
      select: {
        id: true,
        departureAt: true,
        flightNo: true,
        case: { select: { id: true, code: true, userId: true } },
      },
    });

    let sent = 0;
    for (const plan of upcoming) {
      if (!plan.departureAt) continue;
      const daysLeft = Math.ceil((plan.departureAt.getTime() - now.getTime()) / DAY_MS);
      const offset = DEPARTURE_OFFSETS.find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.DEPARTURE_NEAR,
        userIds: [plan.case.userId],
        caseId: plan.case.id,
        dedupeSubject: `${plan.id}:${offset}`,
        context: {
          departureDate: formatDateMn(plan.departureAt),
          flightNumber: plan.flightNo,
          daysLeft: Math.max(daysLeft, 0),
          caseCode: plan.case.code,
          caseId: plan.case.id,
        },
      });
    }
    return sent;
  }

  /** 1B-13 — "дараагийн холбогдох огноо болсон", to the assigned consultant. */
  private async sweepLeadFollowUps(now: Date): Promise<number> {
    const endOfToday = new Date(startOfDay(now).getTime() + DAY_MS - 1);

    const due = await this.prisma.lead.findMany({
      where: {
        nextContactAt: { not: null, lte: endOfToday },
        stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
        mergedIntoId: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        stage: true,
        nextContactAt: true,
        assignedToId: true,
      },
    });
    if (!due.length) return 0;

    // Unassigned leads still have to be chased — they go to every consultant.
    const fallback = due.some((lead) => !lead.assignedToId)
      ? await this.prisma.user.findMany({
          where: { isActive: true, role: { in: STAFF_ROLES as unknown as Role[] } },
          select: { id: true },
        })
      : [];

    let sent = 0;
    for (const lead of due) {
      const recipients = lead.assignedToId ? [lead.assignedToId] : fallback.map((staff) => staff.id);
      if (!recipients.length) continue;

      const day = startOfDay(now).toISOString().slice(0, 10);
      sent += await this.notifications.dispatch({
        event: NotificationEvent.LEAD_FOLLOW_UP_DUE,
        userIds: recipients,
        leadId: lead.id,
        dedupeSubject: `${lead.id}:${day}`,
        context: {
          leadId: lead.id,
          leadName: `${lead.lastName} ${lead.firstName}`.trim(),
          leadPhone: lead.phone,
          stageName: LEAD_STAGE_LABELS[lead.stage],
          nextContactDate: formatDateMn(lead.nextContactAt),
        },
      });
    }
    return sent;
  }

  /* ----------------------------------------------------------------------- *
   * Admissions (1H-09)
   *
   * The two sweeps that answer the office's own complaint: a client who lets
   * the round close on them, and a consultant who forgets the client. Both
   * read `internalDeadline` — our date, not the school's.
   * ----------------------------------------------------------------------- */

  /** To the client: the round they chose is closing and documents are short. */
  private async sweepIntakeDeadlines(now: Date): Promise<number> {
    const offsets = (await this.admissionConfig.get()).clientReminderOffsets;
    if (!offsets.length) return 0;

    const horizon = new Date(now.getTime() + Math.max(...offsets) * DAY_MS);

    const cases = await this.prisma.case.findMany({
      where: {
        stage: { notIn: INTAKE_SETTLED_STAGES },
        intake: {
          status: IntakeStatus.OPEN,
          internalDeadline: { not: null, gte: startOfDay(now), lte: horizon },
        },
      },
      select: {
        id: true,
        code: true,
        userId: true,
        intake: {
          select: {
            id: true,
            year: true,
            month: true,
            internalDeadline: true,
            university: { select: { nameMn: true } },
          },
        },
        documents: {
          where: { deletedAt: null, necessity: Necessity.REQUIRED },
          select: { status: true },
        },
      },
    });

    let sent = 0;
    for (const row of cases) {
      const intake = row.intake;
      if (!intake?.internalDeadline) continue;

      const daysLeft = Math.ceil((intake.internalDeadline.getTime() - now.getTime()) / DAY_MS);
      // Sorted descending, so the first match is the tightest rung reached.
      const offset = [...offsets].sort((a, b) => a - b).find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      const missing = row.documents.filter((doc) => !SETTLED_STATUSES.includes(doc.status)).length;

      sent += await this.notifications.dispatch({
        event: NotificationEvent.INTAKE_DEADLINE_NEAR,
        userIds: [row.userId],
        caseId: row.id,
        dedupeSubject: `${intake.id}:${offset}`,
        context: {
          universityName: intake.university.nameMn,
          intakeName: intakeName(intake.year, intake.month),
          deadlineDate: formatDateMn(intake.internalDeadline),
          daysLeft: Math.max(daysLeft, 0),
          missingDocuments: missing,
          caseCode: row.code,
          caseId: row.id,
        },
      });
    }
    return sent;
  }

  /**
   * To the assigned consultant and document officer: this case is short on
   * documents with its deadline in sight.
   *
   * Deliberately staff-only. The client already gets their own countdown; this
   * is the one that makes a forgotten case visible to somebody who can act.
   */
  private async sweepAtRiskCases(now: Date): Promise<number> {
    const config = await this.admissionConfig.get();
    if (!config.staffReminderOffsets.length) return 0;

    const horizon = new Date(now.getTime() + Math.max(...config.staffReminderOffsets) * DAY_MS);

    const cases = await this.prisma.case.findMany({
      where: {
        stage: { notIn: INTAKE_SETTLED_STAGES },
        intake: {
          status: IntakeStatus.OPEN,
          internalDeadline: { not: null, gte: startOfDay(now), lte: horizon },
        },
      },
      select: {
        id: true,
        code: true,
        assignedConsultantId: true,
        assignedDocOfficerId: true,
        user: { select: { name: true, client: { select: { lastName: true, firstName: true } } } },
        intake: {
          select: {
            id: true,
            year: true,
            month: true,
            internalDeadline: true,
            university: { select: { nameMn: true } },
          },
        },
        documents: {
          where: { deletedAt: null, necessity: Necessity.REQUIRED },
          select: { status: true },
        },
      },
    });
    if (!cases.length) return 0;

    // A case nobody owns is the worst version of this problem, so it goes to
    // every active consultant rather than nowhere.
    const needsFallback = cases.some((row) => !row.assignedConsultantId && !row.assignedDocOfficerId);
    const fallback = needsFallback
      ? await this.prisma.user.findMany({
          where: { isActive: true, role: { in: STAFF_ROLES as unknown as Role[] } },
          select: { id: true },
        })
      : [];

    let sent = 0;
    for (const row of cases) {
      const intake = row.intake;
      if (!intake?.internalDeadline) continue;

      const daysLeft = Math.ceil((intake.internalDeadline.getTime() - now.getTime()) / DAY_MS);
      const offset = [...config.staffReminderOffsets]
        .sort((a, b) => a - b)
        .find((candidate) => daysLeft <= candidate);
      if (offset === undefined) continue;

      const required = row.documents.length;
      const done = row.documents.filter((doc) => SETTLED_STATUSES.includes(doc.status)).length;
      // No document list yet is 0% ready, not 100% — that case is exactly the
      // one nobody has started.
      const readiness = required ? Math.round((done / required) * 100) : 0;
      if (readiness >= config.riskReadinessThreshold) continue;

      const recipients = [row.assignedConsultantId, row.assignedDocOfficerId].filter(
        (id): id is string => Boolean(id),
      );
      const userIds = recipients.length ? recipients : fallback.map((staff) => staff.id);
      if (!userIds.length) continue;

      const client = row.user.client;
      sent += await this.notifications.dispatch({
        event: NotificationEvent.INTAKE_CASE_AT_RISK,
        userIds,
        caseId: row.id,
        dedupeSubject: `${intake.id}:${row.id}:${offset}`,
        context: {
          caseCode: row.code,
          caseId: row.id,
          clientName: client ? `${client.lastName} ${client.firstName}` : (row.user.name ?? '—'),
          universityName: intake.university.nameMn,
          intakeName: intakeName(intake.year, intake.month),
          deadlineDate: formatDateMn(intake.internalDeadline),
          daysLeft: Math.max(daysLeft, 0),
          readiness,
          missingDocuments: required - done,
        },
      });
    }
    return sent;
  }
}

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}
