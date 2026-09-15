import { Injectable, Logger } from '@nestjs/common';
import { CaseStage, ContractStatus, PaymentStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdmissionConfigService } from '../admissions/admission-config.service.js';
import { PRE_PREPAYMENT_STAGES } from '../cases/case-flow.js';
import { CasesService } from '../cases/cases.service.js';
import { CASE_STAGE_LABELS } from '../cases/case-stage-labels.js';
import { DAY_MS, formatDateMn } from '../notifications/notification-labels.js';
import { SlackService } from '../notifications/slack.service.js';
import { PaymentsService } from './payments.service.js';

/** A contract that dies with its case: never signed, or signed and never paid for. */
const UNPAID_CONTRACT_STATUSES: ContractStatus[] = [ContractStatus.DRAFT, ContractStatus.SENT, ContractStatus.SIGNED];

const CANDIDATE_SELECT = {
  id: true,
  code: true,
  stage: true,
  createdAt: true,
  contract: { select: { createdAt: true, sentAt: true, acceptedAt: true, otpVerifiedAt: true, signedAt: true } },
  transitions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
  payments: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
  user: { select: { name: true, client: { select: { lastName: true, firstName: true } } } },
} as const;

type MovementFacts = {
  createdAt: Date;
  contract: { createdAt: Date; sentAt: Date | null; acceptedAt: Date | null; otpVerifiedAt: Date | null; signedAt: Date | null } | null;
  transitions: { createdAt: Date }[];
  payments: { createdAt: Date }[];
};

/**
 * The last time anything happened on a case before its prepayment: it was
 * opened, its contract was issued, sent, agreed to or signed, it changed stage,
 * or an invoice was raised. "Three days" runs from here, so a client who signed
 * yesterday is not cancelled for having registered last week.
 */
export function lastMovementAt(row: MovementFacts): Date {
  const dates = [
    row.createdAt,
    row.contract?.createdAt,
    row.contract?.sentAt,
    row.contract?.acceptedAt,
    row.contract?.otpVerifiedAt,
    row.contract?.signedAt,
    row.transitions[0]?.createdAt,
    row.payments[0]?.createdAt,
  ].filter((date): date is Date => Boolean(date));
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

export interface UnpaidCaseSweepResult {
  cancelled: string[];
  /** Money turned out to be in when QPay was asked one last time. */
  paid: string[];
  failed: string[];
}

/**
 * 1C-43 — "үйлчилгээ бүртгэгдээд урьдчилгаагаа төлөөгүй зогссон" cases are
 * cancelled after `AdmissionConfig.unpaidCaseCancelDays` without movement.
 *
 * Before this a drafted contract nobody paid for held its place in every count
 * forever, and the client list called it active. The rule reaches only cases
 * standing before `PREPAYMENT_PAID`: a paused case is a staff decision and is
 * left alone, and a case with a `PAID` row that somehow never moved on (1N-07)
 * needs a person, not a cancellation.
 *
 * One case at a time, and one failure never ends the pass — the same shape as
 * the QPay sweep, because the last step before cancelling is a call to QPay.
 */
@Injectable()
export class UnpaidCaseSweepService {
  private readonly logger = new Logger(UnpaidCaseSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admissionConfig: AdmissionConfigService,
    private readonly cases: CasesService,
    private readonly payments: PaymentsService,
    private readonly slack: SlackService,
  ) {}

  async sweep(now: Date = new Date()): Promise<UnpaidCaseSweepResult> {
    const result: UnpaidCaseSweepResult = { cancelled: [], paid: [], failed: [] };
    const days = (await this.admissionConfig.get()).unpaidCaseCancelDays;
    if (!days) return result;

    const cutoff = new Date(now.getTime() - days * DAY_MS);
    // `createdAt` is the earliest movement a case can have, so it narrows the
    // read without deciding anything; `lastMovementAt` decides.
    const candidates = await this.prisma.case.findMany({
      where: {
        stage: { in: [...PRE_PREPAYMENT_STAGES] },
        createdAt: { lt: cutoff },
        payments: { none: { status: PaymentStatus.PAID } },
      },
      select: CANDIDATE_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    for (const row of candidates) {
      const lastMovement = lastMovementAt(row);
      if (lastMovement >= cutoff) continue;

      try {
        if (await this.payments.settleBeforeCancel(row.id)) {
          result.paid.push(row.code);
          continue;
        }

        const reason = `Урьдчилгаа төлбөр ${days} хоногийн дотор төлөгдөөгүй тул автоматаар цуцлав (сүүлийн хөдөлгөөн ${formatDateMn(lastMovement)})`;
        await this.prisma.$transaction(async (tx) => {
          await tx.contract.updateMany({
            where: { caseId: row.id, status: { in: UNPAID_CONTRACT_STATUSES } },
            data: { status: ContractStatus.TERMINATED },
          });
          await this.cases.cancelBySystem(tx, row.id, row.stage, reason);
        });

        result.cancelled.push(row.code);
        await this.announce(row, days, lastMovement);
      } catch (error) {
        result.failed.push(row.code);
        this.logger.warn(
          `${row.code}: төлбөргүй үйлчилгээг цуцалж чадсангүй — ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (result.cancelled.length || result.paid.length || result.failed.length) {
      this.logger.log(`Төлбөргүй үйлчилгээ: ${JSON.stringify(result)}`);
    }
    return result;
  }

  /** The office hears about every cancellation — it is the one thing the sweep does that a person might dispute. */
  private async announce(
    row: { id: string; code: string; stage: CaseStage; user: { name: string | null; client: { lastName: string; firstName: string } | null } },
    days: number,
    lastMovement: Date,
  ): Promise<void> {
    const client = row.user.client;
    await this.slack.notify({
      emoji: '🗂️',
      title: 'Төлбөргүй үйлчилгээ автоматаар цуцлагдлаа',
      fields: [
        { label: 'Үйлчилгээ', value: row.code },
        { label: 'Үйлчлүүлэгч', value: client ? `${client.lastName} ${client.firstName}` : (row.user.name ?? '—') },
        { label: 'Байсан шат', value: CASE_STAGE_LABELS[row.stage] },
        { label: 'Сүүлийн хөдөлгөөн', value: `${formatDateMn(lastMovement)} (${days}+ хоног)` },
      ],
      link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${row.id}` },
    });
  }
}
