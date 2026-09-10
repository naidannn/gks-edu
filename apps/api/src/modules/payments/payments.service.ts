import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { assertOwnerOrCrm } from '../../common/auth/assert-owner.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { isCrmStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  CaseStage,
  type Contract,
  ContractStatus,
  NotificationEvent,
  PaymentKind,
  type PaymentMethod,
  PaymentStatus,
  type Prisma,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import {
  QPAY_POLL_INTERVAL_MS,
  QPAY_POLL_LIMIT,
  QPAY_POLL_QUEUE,
  QPAY_POLL_TIMEOUT_MS,
} from '../../queue/queue.constants.js';
import { CasesService } from '../cases/cases.service.js';
import { CASE_STAGE_LABELS } from '../cases/case-stage-labels.js';
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, formatAmountMn, formatDateMn } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import type { MetaActionSource, MetaStandardEvent } from '../meta/meta-capi.types.js';
import { MetaEventsService } from '../meta/meta-events.service.js';
import type { MetaUserIdentity } from '../meta/meta-user-data.js';
import { DEFAULT_PAYMENT_DUE_DAYS, paymentDueAt } from '../pricing/payment-terms.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentsDto } from './dto/query-payments.dto.js';
import type { RegisterManualPaymentDto } from './dto/register-manual-payment.dto.js';
import { toClientPayment } from './client-payment.select.js';
import type { QpayCheckResult } from './qpay-client.service.js';
import { QpayClientService } from './qpay-client.service.js';


/** Target case stage each payment kind advances once confirmed (1C-15). */
const PROGRESS_TARGET: Partial<Record<PaymentKind, CaseStage>> = {
  [PaymentKind.PREPAYMENT]: CaseStage.PREPAYMENT_PAID,
  [PaymentKind.BALANCE]: CaseStage.BALANCE_PAID,
};

/** A debt is settled or still owed; anything else is history and never blocks a new invoice. */
const LIVE_STATUSES: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.PAID];

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly qpay: QpayClientService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly slack: SlackService,
    private readonly storage: StorageService,
    private readonly pricing: PricingService,
    private readonly meta: MetaEventsService,
    @InjectQueue(QPAY_POLL_QUEUE) private readonly pollQueue: Queue,
  ) {}

  // ─── Creating an invoice (1C-12) ───────────────────────────────────────────

  /** Self-service by design (gksedu.md §5.5: the user pays via QPay) — staff may also create one on a case they don't own. */
  async createForCase(caseId: string, dto: CreatePaymentDto, actor: AuthenticatedUser) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { contract: true } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);
    assertOwnerOrCrm(gksCase.userId, actor, 'Энэ үйлчилгээнд төлбөр үүсгэх эрхгүй байна');
    const contract = await this.assertReadyFor(gksCase, dto.kind);

    const existing = await this.openPayment(caseId, dto.kind);
    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException(`${PAYMENT_KIND_LABELS[dto.kind]} аль хэдийн төлөгдсөн байна`);
    }
    // A PENDING row with an invoice behind it is the same debt, so the same QR
    // is handed back. One without an invoice is the wreckage of a QPay outage:
    // there is nothing for the client to scan, so the row is reused rather than
    // returned forever (1N-09).
    if (existing?.status === PaymentStatus.PENDING && existing.qpayInvoiceId) {
      return this.forActor(existing, actor);
    }

    const amountMnt = this.resolveAmount(dto.kind, contract);

    let payment = existing;
    if (!payment) {
      try {
        payment = await this.prisma.payment.create({
          data: {
            caseId,
            kind: dto.kind,
            amountMnt,
            status: PaymentStatus.PENDING,
            dueAt: await this.dueAtFor(gksCase.serviceType),
          },
        });
      } catch (error) {
        // The partial unique index on (caseId, kind) WHERE PENDING: a double
        // click, or the client and their consultant pressing at once. Whoever
        // lost reads the row the winner made instead of minting a second QR.
        if (!isUniqueViolation(error)) throw error;
        const raced = await this.openPayment(caseId, dto.kind);
        if (raced?.status === PaymentStatus.PENDING) return this.forActor(raced, actor);
        throw new ConflictException(`${PAYMENT_KIND_LABELS[dto.kind]} дээр нэхэмжлэх үүсгэх явцад зөрчил гарлаа — дахин оролдоно уу`);
      }
    }

    const callbackUrl = `${this.config.getOrThrow<string>('qpay.callbackUrl')}?paymentId=${payment.id}`;
    let invoice;
    try {
      invoice = await this.qpay.createInvoice({
        invoiceNo: payment.id,
        amount: amountMnt,
        description: `${gksCase.code} - ${dto.kind}`,
        callbackUrl,
      });
    } catch (error) {
      // QPay refused, and a PENDING row with no invoice behind it holds the
      // (caseId, kind) slot against every later attempt. Failing it frees the
      // slot, so "try again" is a real answer.
      await this.prisma.payment
        .updateMany({ where: { id: payment.id, status: PaymentStatus.PENDING }, data: { status: PaymentStatus.FAILED } })
        .catch(() => undefined);
      throw error;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { qpayInvoiceId: invoice.invoiceId, qrText: invoice.qrText, qrImage: invoice.qrImage },
    });

    await this.pollQueue.upsertJobScheduler(
      payment.id,
      { every: QPAY_POLL_INTERVAL_MS, limit: QPAY_POLL_LIMIT },
      { data: { paymentId: payment.id } },
    );

    await this.reportPaymentToMeta('InitiateCheckout', {
      paymentId: payment.id,
      caseId,
      userId: gksCase.userId,
      kind: dto.kind,
      amountMnt,
      actionSource: 'website',
    });

    return this.forActor(updated, actor);
  }

  /** The invoice as the caller may see it — the same narrowing `findOne` does (1N-04). */
  private forActor<T extends Parameters<typeof toClientPayment>[0]>(payment: T, actor: AuthenticatedUser) {
    return isCrmStaff(actor.role) ? payment : toClientPayment(payment);
  }

  // ─── Registering money that never went through QPay (1C-27) ────────────────

  /**
   * Bank transfer, card at the desk, cash over the counter — gksedu.md §24 q5.
   * The money has already arrived by the time this is called, so the row is
   * born PAID: there is nothing to poll and nothing for the client to do.
   *
   * A QPay invoice already sitting on the case is *converted* rather than
   * duplicated — a client who was handed a QR and then walked into the office
   * with cash must not end up owing the prepayment twice. Everything after the
   * row exists (contract → ACTIVE, the stage move, the notification) is
   * `confirmPayment`, the same path the webhook takes.
   */
  async registerManual(caseId: string, dto: RegisterManualPaymentDto, actorId: string, receipt?: Buffer) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { contract: true } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const contract = await this.assertReadyFor(gksCase, dto.kind);

    const paidAt = new Date(dto.paidAt);
    if (paidAt.getTime() > Date.now()) {
      throw new BadRequestException('Ирээдүйн огноогоор төлбөр бүртгэх боломжгүй');
    }

    const existing = await this.openPayment(caseId, dto.kind);
    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException(`${PAYMENT_KIND_LABELS[dto.kind]} аль хэдийн төлөгдсөн байна`);
    }

    // Uploaded before the write so a rejected file (wrong type, too big) fails
    // the request instead of leaving a confirmed payment with no receipt.
    const receiptPath = receipt
      ? (await this.storage.upload({ caseId, docCode: 'PAYMENT_RECEIPT', buffer: receipt })).path
      : undefined;

    const manualFields = {
      method: dto.method,
      reference: dto.reference ?? null,
      note: dto.note ?? null,
      createdById: actorId,
      // Only written when a file came with the request: converting a row must
      // never blank a receipt that is already attached to it.
      ...(receiptPath ? { receiptPath } : {}),
    };

    const payment = existing
      ? await this.prisma.payment.update({ where: { id: existing.id }, data: manualFields })
      : await this.prisma.payment.create({
          data: {
            caseId,
            kind: dto.kind,
            amountMnt: this.resolveAmount(dto.kind, contract),
            status: PaymentStatus.PENDING,
            ...manualFields,
          },
        });

    // The client is holding a QR for money they have just handed over at the
    // desk. Left alive, it is scannable tomorrow and they pay the same debt
    // twice — which §6.4 forbids (1N-10).
    if (existing?.status === PaymentStatus.PENDING && existing.qpayInvoiceId) {
      await this.qpay.cancelInvoice(existing.qpayInvoiceId);
    }

    return this.confirmPayment(payment.id, { paidAt });
  }

  /**
   * The live row for a debt, newest first: `EXPIRED`, `FAILED` and `REFUNDED`
   * rows are history, and a refunded prepayment must not read as "already paid"
   * (1N-08, 1N-09).
   */
  private openPayment(caseId: string, kind: PaymentKind) {
    return this.prisma.payment.findFirst({
      where: { caseId, kind, status: { in: LIVE_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Signed download token for a manually attached receipt (§9). */
  async receiptUrl(id: string, user: AuthenticatedUser) {
    const payment = await this.getOrThrow(id);
    this.assertAccess(payment, user);
    if (!payment.receiptPath) throw new NotFoundException('Энэ төлбөр дээр баримт хавсаргаагүй байна');
    return this.storage.sign(payment.receiptPath);
  }

  // ─── Reading ────────────────────────────────────────────────────────────────

  async findAllStaff(query: QueryPaymentsDto) {
    const where = this.buildWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: { case: { select: { id: true, code: true, user: { select: { id: true, name: true, email: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /** Receivables view (1C-18) — total still outstanding, grouped by kind. */
  async stats() {
    const [pendingByKind, overdueCount] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['kind'], where: { status: PaymentStatus.PENDING }, _sum: { amountMnt: true }, _count: { _all: true } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.PENDING, dueAt: { lt: new Date() } } }),
    ]);
    return {
      pendingByKind: pendingByKind.map((row) => ({ kind: row.kind, totalMnt: row._sum.amountMnt ?? 0, count: row._count._all })),
      overdueCount,
    };
  }

  /**
   * One payment. Staff see the row; the client who owes it sees the invoice —
   * the note a staff member wrote at the desk, the receipt's storage path, who
   * registered it and QPay's own payment id are all ours (1N-04).
   */
  async findOne(id: string, user: AuthenticatedUser) {
    const payment = await this.getOrThrow(id);
    this.assertAccess(payment, user);
    return isCrmStaff(user.role) ? payment : toClientPayment(payment);
  }

  // ─── Webhook + polling (1C-13, 1C-14) — both funnel into `confirmPayment` ───

  /**
   * `POST /payments/qpay/webhook?paymentId=...` — the callback is a trigger,
   * never a trusted status.
   *
   * The route is public, so most of what reaches it is not QPay: scanners
   * probe it with no parameter at all. That is not an error worth raising —
   * answer the same `ok` a callback for an unknown payment gets, and never
   * hand a non-id to Prisma, which would fail the request as a 500.
   */
  async handleWebhook(paymentId?: string): Promise<{ ok: boolean }> {
    if (!paymentId) {
      this.logger.warn('QPay webhook paymentId-гүй ирлээ');
      return { ok: true };
    }

    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      this.logger.warn(`QPay webhook танихгүй төлбөр дээр ирлээ: ${paymentId}`);
      return { ok: true };
    }
    if (payment.status !== PaymentStatus.PENDING || !payment.qpayInvoiceId) return { ok: true };

    const result = await this.qpay.checkPayment(payment.qpayInvoiceId);
    await this.creditIfFullyPaid(payment, result);
    return { ok: true };
  }

  /** BullMQ job body (1C-14) — same independent re-verification as the webhook. */
  async pollOnce(paymentId: string): Promise<void> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.status !== PaymentStatus.PENDING || !payment.qpayInvoiceId) {
      await this.pollQueue.removeJobScheduler(paymentId).catch(() => undefined);
      return;
    }

    const result = await this.qpay.checkPayment(payment.qpayInvoiceId);
    if (result.paid) {
      await this.creditIfFullyPaid(payment, result);
      return;
    }

    // The schedule has run out. A PENDING row holds the (caseId, kind) slot, so
    // leaving it there means the client can never be given a fresh QR — expire
    // it instead, and take QPay's copy of the invoice down with it (1N-09).
    if (Date.now() - payment.createdAt.getTime() > QPAY_POLL_TIMEOUT_MS) {
      await this.expireInvoice(payment);
    }
  }

  /**
   * QPay says the invoice is paid — but not always for the full amount (1N-10).
   * A short payment is reported and left PENDING rather than clearing a debt it
   * does not cover; `confirmPayment` handles the other direction, a second QPay
   * reference against a row already credited.
   */
  private async creditIfFullyPaid(
    payment: { id: string; amountMnt: Prisma.Decimal; caseId: string },
    result: QpayCheckResult,
  ): Promise<void> {
    if (!result.paid) return;

    if (result.paidAmount !== undefined && result.paidAmount < Number(payment.amountMnt)) {
      this.logger.warn(`QPay дутуу төлбөр: ${payment.id} — ${result.paidAmount}₮ / ${payment.amountMnt}₮`);
      await this.slack.notify({
        emoji: '⚠️',
        title: 'QPay дутуу төлбөр ирлээ',
        fields: [
          { label: 'Төлбөр', value: payment.id },
          { label: 'Ирсэн дүн', value: formatAmountMn(result.paidAmount) },
          { label: 'Нэхэмжилсэн дүн', value: formatAmountMn(payment.amountMnt) },
        ],
        link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${payment.caseId}` },
      });
      return;
    }

    await this.confirmPayment(payment.id, { qpayPaymentId: result.qpayPaymentId });
  }

  /** Two QPay payment ids against one invoice: the money is in, and somebody has to give one of them back. */
  private async reportDoublePayment(payment: { id: string; caseId: string; qpayPaymentId: string | null }, incoming: string): Promise<void> {
    this.logger.warn(`Давхар төлбөр: ${payment.id} — ${payment.qpayPaymentId} дээр ${incoming} нэмж ирлээ`);
    await this.slack.notify({
      emoji: '🚨',
      title: 'Давхар төлбөр',
      fields: [
        { label: 'Төлбөр', value: payment.id },
        { label: 'Бүртгэсэн QPay гүйлгээ', value: payment.qpayPaymentId },
        { label: 'Шинээр ирсэн QPay гүйлгээ', value: incoming },
      ],
      link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${payment.caseId}` },
    });
  }

  /** Retires an unpaid invoice: our row first, then QPay's copy of it, then the poller. */
  private async expireInvoice(payment: { id: string; qpayInvoiceId: string | null }): Promise<void> {
    const expired = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.EXPIRED },
    });
    if (expired.count > 0 && payment.qpayInvoiceId) {
      await this.qpay.cancelInvoice(payment.qpayInvoiceId);
    }
    await this.pollQueue.removeJobScheduler(payment.id).catch(() => undefined);
  }

  /** Dev/test only (1C-20) — flips a payment PAID without a real QPay account. */
  async devMarkPaid(paymentId: string) {
    if (this.config.get<string>('nodeEnv') === 'production') {
      throw new ForbiddenException('dev-mark-paid боловсруулах орчинд идэвхгүй');
    }
    return this.confirmPayment(paymentId);
  }

  /**
   * Idempotent: PAID short-circuits, PENDING credits and advances the case
   * (§5.5) — the same path for the webhook, the polling fallback, a manual
   * registration (1C-27) and the dev shortcut.
   *
   * Money first, stage second, and deliberately not in one transaction (1N-07).
   * They used to share one: a case that had been put on hold, or had already
   * moved past the stage this payment unlocks, made `applySystemTransition`
   * throw — which rolled back a payment QPay had taken. The webhook then 500'd
   * and the poller retried the same failure until it gave up. What the stage
   * graph thinks is never a reason to lose a receipt.
   */
  async confirmPayment(paymentId: string, opts: { qpayPaymentId?: string; paidAt?: Date } = {}) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { case: { include: { contract: true } } },
    });
    if (!payment) throw new NotFoundException(`Төлбөр ${paymentId} олдсонгүй`);

    // Claiming the row is one statement, and only a PENDING row can be
    // claimed. The webhook and the polling job fire on the same payment
    // within milliseconds of each other, so "read the status, then write it"
    // lets both through: two stage transitions, and the client thanked twice
    // for the same money. `updateMany` re-checks the status as it writes, so
    // exactly one caller comes back with a count of 1.
    const claimed = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      // A manual registration carries the date the money actually arrived, which
      // is rarely the date somebody got round to typing it in (1C-27).
      data: { status: PaymentStatus.PAID, paidAt: opts.paidAt ?? new Date(), qpayPaymentId: opts.qpayPaymentId },
    });

    let alreadyPaid = false;
    let confirmed;

    if (claimed.count === 0) {
      // Either it was already PAID when we read it, or the other caller
      // committed between our read and our write — re-read to tell those
      // apart from a row that is genuinely in no state to be confirmed.
      const settled = await this.prisma.payment.findUnique({ where: { id: paymentId } });
      if (settled?.status !== PaymentStatus.PAID) {
        throw new BadRequestException(
          `${settled?.status ?? payment.status} төлөвт байгаа төлбөрийг баталгаажуулах боломжгүй`,
        );
      }
      // A second QPay reference against a payment we have already credited is
      // money that arrived twice, not a duplicate callback (1N-10).
      if (opts.qpayPaymentId && settled.qpayPaymentId && settled.qpayPaymentId !== opts.qpayPaymentId) {
        await this.reportDoublePayment(settled, opts.qpayPaymentId);
      }
      alreadyPaid = true;
      confirmed = settled;
    } else {
      confirmed = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await this.applyPaymentProgress(payment);
    }

    await this.pollQueue.removeJobScheduler(paymentId).catch(() => undefined);

    // §16 "Төлбөр баталгаажсан". Idempotent callers (webhook + polling both
    // fire) must not notify twice, hence the `alreadyPaid` short-circuit.
    if (!alreadyPaid) {
      const withCase = await this.prisma.payment.findUnique({
        where: { id: paymentId },
        select: { kind: true, method: true, amountMnt: true, paidAt: true, case: { select: { id: true, code: true, userId: true } } },
      });
      if (withCase) {
        await this.notifications.dispatch({
          event: NotificationEvent.PAYMENT_CONFIRMED,
          userIds: [withCase.case.userId],
          caseId: withCase.case.id,
          context: {
            caseId: withCase.case.id,
            caseCode: withCase.case.code,
            paymentKindName: PAYMENT_KIND_LABELS[withCase.kind],
            amount: formatAmountMn(withCase.amountMnt),
            paidAt: formatDateMn(withCase.paidAt),
          },
        });

        await this.slack.notify({
          emoji: '💰',
          title: 'Төлбөр баталгаажлаа',
          fields: [
            { label: 'Үйлчилгээ', value: withCase.case.code },
            { label: 'Төрөл', value: PAYMENT_KIND_LABELS[withCase.kind] },
            { label: 'Суваг', value: PAYMENT_METHOD_LABELS[withCase.method] },
            { label: 'Дүн', value: formatAmountMn(withCase.amountMnt) },
            { label: 'Огноо', value: formatDateMn(withCase.paidAt) },
          ],
          link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${withCase.case.id}` },
        });

        await this.reportPaymentToMeta('Purchase', {
          paymentId,
          caseId: withCase.case.id,
          userId: withCase.case.userId,
          kind: withCase.kind,
          amountMnt: withCase.amountMnt,
          // Money that arrived over the counter is not a website conversion,
          // whatever the campaign would prefer to believe.
          actionSource: withCase.method === 'QPAY' ? 'website' : 'physical_store',
          method: withCase.method,
          occurredAt: withCase.paidAt ?? undefined,
        });
      }
    }

    return confirmed;
  }

  /**
   * What a credited payment does to the rest of the case: the contract goes
   * ACTIVE, the stage moves on.
   *
   * Both are consequences of money that is already in the bank, so a missing
   * edge is reported, not raised — the office is told the case needs a hand,
   * and the webhook still answers 200 (1N-07).
   */
  private async applyPaymentProgress(payment: {
    id: string;
    kind: PaymentKind;
    caseId: string;
    case: { code: string; contract: { id: string } | null };
  }): Promise<void> {
    const targetStage = PROGRESS_TARGET[payment.kind];
    if (!targetStage) return;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (payment.kind === PaymentKind.PREPAYMENT && payment.case.contract) {
          await tx.contract.update({ where: { id: payment.case.contract.id }, data: { status: ContractStatus.ACTIVE } });
        }
        await this.cases.applySystemTransition(tx, payment.caseId, targetStage);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`${payment.case.code}: төлбөр орсон ч ${CASE_STAGE_LABELS[targetStage]} руу шилжсэнгүй — ${reason}`);
      await this.slack.notify({
        emoji: '⚠️',
        title: 'Төлбөр орсон ч үе шат хөдөлсөнгүй',
        fields: [
          { label: 'Үйлчилгээ', value: payment.case.code },
          { label: 'Төрөл', value: PAYMENT_KIND_LABELS[payment.kind] },
          { label: 'Зорилтот шат', value: CASE_STAGE_LABELS[targetStage] },
          { label: 'Шалтгаан', value: reason },
        ],
        link: { label: 'Үйлчилгээг нээх', path: `/admin/cases/${payment.caseId}` },
      });
    }
  }

  /**
   * `InitiateCheckout` and `Purchase` (1A-38).
   *
   * The `event_id` is the payment id, which is the neat part: the payment page
   * fires the same two events in the browser and derives the same id from the
   * same row, so the pair deduplicates without either side having to tell the
   * other anything. It also survives the confirmation arriving twice — the
   * QPay webhook and the polling fallback race each other on every payment.
   *
   * Identity comes from the `Client` record when there is one. That is the row
   * the contract is written against, so it carries a verified name, birth date
   * and phone — several matching signals a login-only `User` does not have.
   */
  private async reportPaymentToMeta(
    eventName: Extract<MetaStandardEvent, 'InitiateCheckout' | 'Purchase'>,
    payment: {
      paymentId: string;
      caseId: string;
      userId: string;
      kind: PaymentKind;
      amountMnt: Prisma.Decimal | number;
      actionSource: MetaActionSource;
      method?: PaymentMethod;
      occurredAt?: Date;
    },
  ): Promise<void> {
    // Everything below is measurement, and measurement never fails a payment:
    // `MetaEventsService.track` swallows its own errors, but the identity read
    // in front of it is a database call like any other.
    const user = await this.prisma.user
      .findUnique({
        where: { id: payment.userId },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          client: {
            select: { firstName: true, lastName: true, phone: true, email: true, gender: true, birthDate: true },
          },
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Meta ${eventName}-д хэрэглэгчийн мэдээлэл уншигдсангүй: ${error instanceof Error ? error.message : String(error)}`,
        );
        return null;
      });

    const client = user?.client;
    const identity: MetaUserIdentity = {
      email: client?.email ?? user?.email,
      phone: client?.phone ?? user?.phone,
      firstName: client?.firstName,
      lastName: client?.lastName,
      gender: client?.gender,
      birthDate: client?.birthDate,
      country: 'mn',
      externalIds: [payment.userId],
    };

    await this.meta.track({
      eventName,
      eventId: payment.paymentId,
      eventTime: payment.occurredAt,
      actionSource: payment.actionSource,
      identity,
      customData: {
        value: Number(payment.amountMnt),
        currency: 'MNT',
        content_type: 'product',
        content_ids: [payment.kind],
        content_name: PAYMENT_KIND_LABELS[payment.kind],
        order_id: payment.paymentId,
        ...(payment.method ? { status: payment.method } : {}),
      },
    });
  }

  // ─── Refund (1C-16) ─────────────────────────────────────────────────────────

  /**
   * Records money going back out (1C-16): a `REFUND` row facing the original,
   * and the original marked `REFUNDED` so it stops counting as money we hold.
   *
   * The two writes are one fact, so they are one transaction. The guard against
   * refunding twice is the unique index on `refundOfId`, not a read in front of
   * it — a double click races the index and loses cleanly (1N-08).
   *
   * The case stage is deliberately left where it is: whether a refunded
   * prepayment reopens `CONTRACT_SIGNED` is a business decision, not one to
   * make here.
   */
  async refund(paymentId: string, actorId: string) {
    const original = await this.getOrThrow(paymentId);
    if (original.kind === PaymentKind.REFUND) {
      throw new BadRequestException('Буцаалтын гүйлгээг дахин буцаах боломжгүй');
    }
    if (original.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Зөвхөн төлөгдсөн төлбөрийг буцаана');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const refund = await tx.payment.create({
          data: {
            caseId: original.caseId,
            kind: PaymentKind.REFUND,
            amountMnt: original.amountMnt,
            status: PaymentStatus.PAID,
            // Money goes back the way it came in unless someone says otherwise —
            // a cash prepayment is refunded at the desk, not through QPay.
            method: original.method,
            paidAt: new Date(),
            refundOfId: original.id,
            createdById: actorId,
          },
        });
        await tx.payment.update({ where: { id: original.id }, data: { status: PaymentStatus.REFUNDED } });
        return refund;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Энэ төлбөр аль хэдийн буцаагдсан байна');
      }
      throw error;
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  /**
   * A payment only makes sense where the case flow is ready to take it: the
   * contract must be past DRAFT, and the stage graph must have a system edge
   * from where the case stands to the stage this kind of payment unlocks.
   * Shared by the QPay flow and by manual registration — a bank transfer is
   * not a licence to skip a stage. Returns the contract, now known to exist.
   */
  private async assertReadyFor(
    gksCase: { serviceType: ServiceType; stage: CaseStage; contract: Contract | null },
    kind: PaymentKind,
  ): Promise<Contract> {
    if (!gksCase.contract || gksCase.contract.status === ContractStatus.DRAFT) {
      throw new BadRequestException('Гэрээ гарын үсэг зураагүй тул төлбөр үүсгэх боломжгүй');
    }

    const targetStage = PROGRESS_TARGET[kind];
    if (!targetStage) throw new BadRequestException(`${PAYMENT_KIND_LABELS[kind]} энэ endpoint-оор үүсгэгдэхгүй`);

    const canAdvance = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: gksCase.serviceType, fromStage: gksCase.stage, toStage: targetStage },
      },
    });
    if (!canAdvance?.isSystemOnly) {
      throw new BadRequestException(
        `Үйлчилгээ одоогийн "${CASE_STAGE_LABELS[gksCase.stage]}" шатандаа ${PAYMENT_KIND_LABELS[kind]} хүлээж авахад бэлэн биш байна`,
      );
    }

    return gksCase.contract;
  }

  private buildWhere(query: QueryPaymentsDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.kind) where.kind = query.kind;
    if (query.method) where.method = query.method;
    if (query.q) {
      where.case = {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { user: { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }] } },
        ],
      };
    }
    return where;
  }

  /**
   * When this invoice falls due — the date the "Төлбөрийн хугацаа болсон"
   * reminder, the receivables count and the portal's overdue badge all read.
   *
   * The window is a payment term on the *currently active* pricing, not on the
   * contract's snapshot: see `payment-terms.ts`. A service left without an
   * active price is a configuration fault, and it must not be able to stop the
   * office raising an invoice on a contract that is already signed — so it
   * falls back to the default loudly rather than throwing.
   */
  private async dueAtFor(serviceType: ServiceType): Promise<Date> {
    let days = DEFAULT_PAYMENT_DUE_DAYS;
    try {
      days = (await this.pricing.getActive(serviceType)).paymentDueDays;
    } catch {
      this.logger.warn(
        `${serviceType} үйлчилгээнд идэвхтэй үнэ алга — төлбөрийн хугацааг ${DEFAULT_PAYMENT_DUE_DAYS} хоногоор тооцлоо`,
      );
    }
    return paymentDueAt(new Date(), days);
  }

  private resolveAmount(
    kind: PaymentKind,
    contract: {
      totalAmountSnapshot: Prisma.Decimal;
      prepaymentModeSnapshot: Parameters<typeof PricingService.amounts>[0]['prepaymentMode'];
      prepaymentValueSnapshot: Prisma.Decimal;
    },
  ): number {
    const { prepayment, balance } = PricingService.amounts({
      totalAmount: contract.totalAmountSnapshot,
      prepaymentMode: contract.prepaymentModeSnapshot,
      prepaymentValue: contract.prepaymentValueSnapshot,
    });
    return kind === PaymentKind.PREPAYMENT ? prepayment : balance;
  }

  private assertAccess(payment: { case: { userId: string } }, user: AuthenticatedUser): void {
    assertOwnerOrCrm(payment.case.userId, user, 'Энэ төлбөрт хандах эрхгүй байна');
  }

  private async getOrThrow(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { case: true } });
    if (!payment) throw new NotFoundException(`Төлбөр ${id} олдсонгүй`);
    return payment;
  }
}
