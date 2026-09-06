import { Injectable, NotFoundException } from '@nestjs/common';
import { CaseStage, DocStage, DocumentStatus, PaymentStatus, type Prisma, WorkTaskStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { nextAction } from '../cases/next-action.js';
import { CaseDocumentsService } from '../documents/case-documents.service.js';
import { ClientsService } from './clients.service.js';

/**
 * The CRM client workspace (1G-17).
 *
 * Staff used to answer "юу болж байна вэ?" by walking six screens — the client
 * record, the case, the review queue, the application console, the visa desk and
 * the origin lead. This service assembles the same facts once, per client, so
 * `/admin/clients/:id` can answer the question on one page.
 *
 * It computes nothing new: the stage journey and the next step come from
 * `CasesService`/`nextAction`, exactly as the client portal reads them, so both
 * sides of the platform phrase the answer the same way (1G-15).
 */

/** A case in one of these is over; the newest one outside them is the live one. */
const TERMINAL_STAGES: CaseStage[] = [CaseStage.COMPLETED, CaseStage.CANCELLED, CaseStage.REJECTED];

/** Documents in these states still need someone to act. */
const OPEN_DOC_STATUSES: DocumentStatus[] = [
  DocumentStatus.NOT_STARTED,
  DocumentStatus.IN_PROGRESS,
  DocumentStatus.NEEDS_FIX,
  DocumentStatus.RESUBMIT_REQUIRED,
];

/** How close a deadline has to be before the workspace calls it out. */
const DEADLINE_WARNING_DAYS = 7;

const WORKSPACE_CASE_INCLUDE = {
  university: { select: { id: true, nameMn: true, nameEn: true } },
  universityChoices: {
    orderBy: { sortOrder: 'asc' },
    include: {
      university: { select: { id: true, nameMn: true, nameEn: true } },
      program: { select: { id: true, nameMn: true, nameKo: true, level: true } },
    },
  },
  intake: { select: { id: true, year: true, month: true } },
  contract: { include: { collateralContract: true } },
  payments: { orderBy: { createdAt: 'desc' } },
  assignedConsultant: { select: { id: true, name: true, email: true } },
  assignedDocOfficer: { select: { id: true, name: true, email: true } },
  application: { select: { id: true, status: true, submittedAt: true, interviewAt: true } },
  invitation: { select: { id: true, issuedAt: true, receivedAt: true } },
  visaCase: { select: { id: true, status: true, appointmentAt: true, visaNumber: true, decidedAt: true } },
  departurePlan: { select: { id: true, departureAt: true } },
  transitions: {
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { actor: { select: { id: true, name: true } } },
  },
} satisfies Prisma.CaseInclude;

export type AlertLevel = 'danger' | 'warning' | 'info';

export interface ClientAlert {
  key: string;
  level: AlertLevel;
  label: string;
  detail: string | null;
  /** Which workspace tab resolves it. */
  tab: 'overview' | 'process' | 'documents' | 'payments' | 'activity';
  caseId: string | null;
}

export type ActivityKind =
  | 'LEAD'
  | 'STAGE'
  | 'DOCUMENT'
  | 'PAYMENT'
  | 'TASK'
  | 'APPLICATION'
  | 'VISA';

export interface ClientActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  body: string | null;
  actor: { id: string; name: string | null } | null;
  caseId: string | null;
}

@Injectable()
export class ClientWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly cases: CasesService,
    private readonly documents: CaseDocumentsService,
  ) {}

  /**
   * Everything the workspace header, the overview and the process tab need:
   * the client record, each of their cases decorated with its journey, its
   * paperwork progress and the one thing that has to happen next.
   */
  async workspace(clientId: string) {
    const client = await this.clients.findOne(clientId);

    const rows = await this.prisma.case.findMany({
      where: { userId: client.userId },
      include: WORKSPACE_CASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const cases = await Promise.all(rows.map((row) => this.decorate(row)));
    const active = cases.find((row) => !TERMINAL_STAGES.includes(row.stage)) ?? cases[0] ?? null;

    return {
      client,
      cases,
      activeCaseId: active?.id ?? null,
      alerts: await this.alerts(cases),
    };
  }

  /**
   * One timeline out of the five the platform already keeps — the lead's own
   * history, case transitions, document reviews, payments and back-office
   * tasks. Nothing is rewritten; this only merges what each module records.
   */
  async activity(clientId: string, limit = 60): Promise<ClientActivityEntry[]> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, userId: true, leadId: true },
    });
    if (!client) throw new NotFoundException('Үйлчлүүлэгч олдсонгүй');

    const caseIds = (
      await this.prisma.case.findMany({ where: { userId: client.userId }, select: { id: true } })
    ).map((row) => row.id);

    const [leadActivities, transitions, notes, payments, tasks] = await Promise.all([
      client.leadId
        ? this.prisma.leadActivity.findMany({
            where: { leadId: client.leadId },
            orderBy: { occurredAt: 'desc' },
            take: limit,
            include: { actor: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      this.prisma.caseTransition.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.documentReviewNote.findMany({
        where: { caseDocument: { caseId: { in: caseIds } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          author: { select: { id: true, name: true } },
          caseDocument: { select: { caseId: true, template: { select: { nameMn: true } } } },
        },
      }),
      this.prisma.payment.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.workTask.findMany({
        where: { caseId: { in: caseIds } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        include: { assignee: { select: { id: true, name: true } } },
      }),
    ]);

    const entries: ClientActivityEntry[] = [
      ...leadActivities.map((row) => ({
        id: `lead-${row.id}`,
        kind: 'LEAD' as const,
        at: row.occurredAt.toISOString(),
        title: row.type,
        body: row.body,
        actor: row.actor,
        caseId: null,
      })),
      ...transitions.map((row) => ({
        id: `stage-${row.id}`,
        kind: 'STAGE' as const,
        at: row.createdAt.toISOString(),
        title: `${row.fromStage} → ${row.toStage}`,
        body: row.reason,
        actor: row.actor,
        caseId: row.caseId,
      })),
      ...notes.map((row) => ({
        id: `doc-${row.id}`,
        kind: 'DOCUMENT' as const,
        at: row.createdAt.toISOString(),
        title: row.caseDocument.template.nameMn,
        body: row.body,
        actor: row.author,
        caseId: row.caseDocument.caseId,
      })),
      ...payments.map((row) => ({
        id: `pay-${row.id}`,
        kind: 'PAYMENT' as const,
        at: (row.paidAt ?? row.createdAt).toISOString(),
        title: `${row.kind} · ${row.status}`,
        body: row.amountMnt.toString(),
        actor: null,
        caseId: row.caseId,
      })),
      ...tasks.map((row) => ({
        id: `task-${row.id}`,
        kind: 'TASK' as const,
        at: row.updatedAt.toISOString(),
        title: row.title,
        body: row.status,
        actor: row.assignee,
        caseId: row.caseId,
      })),
    ];

    return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async decorate<T extends Prisma.CaseGetPayload<{ include: typeof WORKSPACE_CASE_INCLUDE }>>(row: T) {
    const [journey, admissionDocs, visaDocs] = await Promise.all([
      this.cases.journey(row.serviceType),
      this.documents.progress(row.id, DocStage.ADMISSION),
      this.documents.progress(row.id, DocStage.VISA),
    ]);

    const stageIndex = journey.indexOf(row.stage);

    return {
      ...row,
      journey,
      /**
       * How far along the service is, as the position of the stage in this
       * service's own flow. A case that has stepped off the main line
       * (ON_HOLD/CANCELLED/REJECTED) keeps the last figure it can prove: 0.
       */
      progressPercent: stageIndex < 0 ? 0 : Math.round((stageIndex / Math.max(1, journey.length - 1)) * 100),
      documents: { admission: admissionDocs, visa: visaDocs },
      nextAction: nextAction({
        serviceType: row.serviceType,
        stage: row.stage,
        contract: row.contract
          ? {
              type: row.contract.type,
              status: row.contract.status,
              acceptedAt: row.contract.acceptedAt,
              otpVerifiedAt: row.contract.otpVerifiedAt,
              balanceTriggerSnapshot: row.contract.balanceTriggerSnapshot,
            }
          : null,
        payments: row.payments.map((payment) => ({ kind: payment.kind, status: payment.status })),
        admissionDocs,
        visaDocs,
      }),
    };
  }

  /**
   * "Юунд анхаарах вэ?" — overdue paperwork, returned documents, unpaid
   * invoices, overdue back-office tasks and deadlines inside a week. Every one
   * of them is a fact already stored by its own module.
   */
  private async alerts(
    cases: { id: string; documents: { admission: { needsFix: number }; visa: { needsFix: number } } }[],
  ): Promise<ClientAlert[]> {
    const caseIds = cases.map((row) => row.id);
    if (caseIds.length === 0) return [];

    const now = new Date();
    const soon = new Date(now.getTime() + DEADLINE_WARNING_DAYS * 86_400_000);

    const [overdueDocs, dueSoonDocs, pendingPayments, overdueTasks] = await Promise.all([
      this.prisma.caseDocument.findMany({
        where: {
          caseId: { in: caseIds },
          deletedAt: null,
          status: { in: OPEN_DOC_STATUSES },
          dueAt: { lt: now },
        },
        select: { id: true, caseId: true, dueAt: true, template: { select: { nameMn: true } } },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.caseDocument.findMany({
        where: {
          caseId: { in: caseIds },
          deletedAt: null,
          status: { in: OPEN_DOC_STATUSES },
          dueAt: { gte: now, lte: soon },
        },
        select: { id: true, caseId: true, dueAt: true, template: { select: { nameMn: true } } },
        orderBy: { dueAt: 'asc' },
      }),
      this.prisma.payment.findMany({
        where: { caseId: { in: caseIds }, status: PaymentStatus.PENDING },
        select: { id: true, caseId: true, kind: true, amountMnt: true, dueAt: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.workTask.findMany({
        where: {
          caseId: { in: caseIds },
          status: { notIn: [WorkTaskStatus.DONE, WorkTaskStatus.CANCELLED] },
          dueAt: { lt: now },
        },
        select: { id: true, caseId: true, title: true, dueAt: true },
        orderBy: { dueAt: 'asc' },
      }),
    ]);

    const alerts: ClientAlert[] = [];

    for (const doc of overdueDocs) {
      alerts.push({
        key: `doc-overdue-${doc.id}`,
        level: 'danger',
        label: `${doc.template.nameMn} — хугацаа хэтэрсэн`,
        detail: doc.dueAt ? doc.dueAt.toISOString() : null,
        tab: 'documents',
        caseId: doc.caseId,
      });
    }

    for (const doc of dueSoonDocs) {
      alerts.push({
        key: `doc-due-${doc.id}`,
        level: 'warning',
        label: `${doc.template.nameMn} — хугацаа дөхсөн`,
        detail: doc.dueAt ? doc.dueAt.toISOString() : null,
        tab: 'documents',
        caseId: doc.caseId,
      });
    }

    for (const row of cases) {
      const needsFix = row.documents.admission.needsFix + row.documents.visa.needsFix;
      if (needsFix > 0) {
        alerts.push({
          key: `doc-fix-${row.id}`,
          level: 'warning',
          label: `${needsFix} материал засвар хүлээж байна`,
          detail: null,
          tab: 'documents',
          caseId: row.id,
        });
      }
    }

    for (const payment of pendingPayments) {
      const overdue = Boolean(payment.dueAt && payment.dueAt < now);
      alerts.push({
        key: `pay-${payment.id}`,
        level: overdue ? 'danger' : 'warning',
        label: overdue ? 'Төлбөрийн хугацаа хэтэрсэн' : 'Төлбөр хүлээгдэж байна',
        detail: `${payment.kind} · ${payment.amountMnt.toString()}`,
        tab: 'payments',
        caseId: payment.caseId,
      });
    }

    for (const task of overdueTasks) {
      alerts.push({
        key: `task-${task.id}`,
        level: 'danger',
        label: `${task.title} — хугацаа хэтэрсэн`,
        detail: task.dueAt ? task.dueAt.toISOString() : null,
        tab: 'process',
        caseId: task.caseId,
      });
    }

    return alerts;
  }
}
