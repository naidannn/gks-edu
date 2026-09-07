import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { paginate } from '../../common/dto/pagination.dto.js';
import { isCrmStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  CaseStage,
  type Contract,
  ContractStatus,
  NotificationEvent,
  PaymentKind,
  PaymentStatus,
  type Prisma,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { QPAY_POLL_INTERVAL_MS, QPAY_POLL_LIMIT, QPAY_POLL_QUEUE } from '../../queue/queue.constants.js';
import { CasesService } from '../cases/cases.service.js';
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, formatAmountMn, formatDateMn } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentsDto } from './dto/query-payments.dto.js';
import type { RegisterManualPaymentDto } from './dto/register-manual-payment.dto.js';
import { QpayClientService } from './qpay-client.service.js';


/** Target case stage each payment kind advances once confirmed (1C-15). */
const PROGRESS_TARGET: Partial<Record<PaymentKind, CaseStage>> = {
  [PaymentKind.PREPAYMENT]: CaseStage.PREPAYMENT_PAID,
  [PaymentKind.BALANCE]: CaseStage.BALANCE_PAID,
};

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
    @InjectQueue(QPAY_POLL_QUEUE) private readonly pollQueue: Queue,
  ) {}

  // ─── Creating an invoice (1C-12) ───────────────────────────────────────────

  /** Self-service by design (gksedu.md §5.5: the user pays via QPay) — staff may also create one on a case they don't own. */
  async createForCase(caseId: string, dto: CreatePaymentDto, actor: AuthenticatedUser) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { contract: true } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);
    if (!isCrmStaff(actor.role) && gksCase.userId !== actor.id) {
      throw new ForbiddenException('Энэ үйлчилгээнд төлбөр үүсгэх эрхгүй байна');
    }
    const contract = await this.assertReadyFor(gksCase, dto.kind);

    const existing = await this.prisma.payment.findFirst({ where: { caseId, kind: dto.kind } });
    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException(`${dto.kind} төлбөр аль хэдийн төлөгдсөн байна`);
    }
    if (existing?.status === PaymentStatus.PENDING) {
      return existing; // idempotent — same invoice/QR handed back rather than creating a duplicate
    }

    const amountMnt = this.resolveAmount(dto.kind, contract);

    const payment = await this.prisma.payment.create({
      data: { caseId, kind: dto.kind, amountMnt, status: PaymentStatus.PENDING },
    });

    const callbackUrl = `${this.config.getOrThrow<string>('qpay.callbackUrl')}?paymentId=${payment.id}`;
    const invoice = await this.qpay.createInvoice({
      invoiceNo: payment.id,
      amount: amountMnt,
      description: `${gksCase.code} - ${dto.kind}`,
      callbackUrl,
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { qpayInvoiceId: invoice.invoiceId, qrText: invoice.qrText, qrImage: invoice.qrImage },
    });

    await this.pollQueue.upsertJobScheduler(
      payment.id,
      { every: QPAY_POLL_INTERVAL_MS, limit: QPAY_POLL_LIMIT },
      { data: { paymentId: payment.id } },
    );

    return updated;
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

    const existing = await this.prisma.payment.findFirst({ where: { caseId, kind: dto.kind } });
    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException(`${dto.kind} төлбөр аль хэдийн төлөгдсөн байна`);
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

    return this.confirmPayment(payment.id, { paidAt });
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

  async findOne(id: string, user: AuthenticatedUser) {
    const payment = await this.getOrThrow(id);
    this.assertAccess(payment, user);
    return payment;
  }

  // ─── Webhook + polling (1C-13, 1C-14) — both funnel into `confirmPayment` ───

  /** `POST /payments/qpay/webhook?paymentId=...` — the callback is a trigger, never a trusted status. */
  async handleWebhook(paymentId: string): Promise<{ ok: boolean }> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      this.logger.warn(`QPay webhook танихгүй төлбөр дээр ирлээ: ${paymentId}`);
      return { ok: true };
    }
    if (payment.status !== PaymentStatus.PENDING || !payment.qpayInvoiceId) return { ok: true };

    const result = await this.qpay.checkPayment(payment.qpayInvoiceId);
    if (result.paid) await this.confirmPayment(paymentId, { qpayPaymentId: result.qpayPaymentId });
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
    if (result.paid) await this.confirmPayment(paymentId, { qpayPaymentId: result.qpayPaymentId });
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
   */
  async confirmPayment(paymentId: string, opts: { qpayPaymentId?: string; paidAt?: Date } = {}) {
    let alreadyPaid = false;

    const confirmed = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { case: { include: { contract: true } } } });
      if (!payment) throw new NotFoundException(`Төлбөр ${paymentId} олдсонгүй`);
      if (payment.status === PaymentStatus.PAID) {
        alreadyPaid = true;
        return payment;
      }
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`${payment.status} төлөвт байгаа төлбөрийг баталгаажуулах боломжгүй`);
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        // A manual registration carries the date the money actually arrived, which
        // is rarely the date somebody got round to typing it in (1C-27).
        data: { status: PaymentStatus.PAID, paidAt: opts.paidAt ?? new Date(), qpayPaymentId: opts.qpayPaymentId },
      });

      const targetStage = PROGRESS_TARGET[payment.kind];
      if (targetStage) {
        if (payment.kind === PaymentKind.PREPAYMENT && payment.case.contract) {
          await tx.contract.update({ where: { id: payment.case.contract.id }, data: { status: ContractStatus.ACTIVE } });
        }
        await this.cases.applySystemTransition(tx, payment.caseId, targetStage);
      }

      return updated;
    });

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
      }
    }

    return confirmed;
  }

  // ─── Refund (1C-16) ─────────────────────────────────────────────────────────

  async refund(paymentId: string, actorId: string) {
    const original = await this.getOrThrow(paymentId);
    if (original.status !== PaymentStatus.PAID) {
      throw new BadRequestException('Зөвхөн төлөгдсөн төлбөрийг буцаана');
    }
    const alreadyRefunded = await this.prisma.payment.findFirst({ where: { refundOfId: paymentId } });
    if (alreadyRefunded) throw new BadRequestException('Энэ төлбөр аль хэдийн буцаагдсан байна');

    return this.prisma.payment.create({
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
    if (!targetStage) throw new BadRequestException(`${kind} энэ endpoint-оор үүсгэгдэхгүй`);

    const canAdvance = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: gksCase.serviceType, fromStage: gksCase.stage, toStage: targetStage },
      },
    });
    if (!canAdvance?.isSystemOnly) {
      throw new BadRequestException(`Үйлчилгээ одоогийн (${gksCase.stage}) шатандаа ${kind} төлбөр хүлээж авахад бэлэн биш байна`);
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
    if (!isCrmStaff(user.role) && payment.case.userId !== user.id) {
      throw new ForbiddenException('Энэ төлбөрт хандах эрхгүй байна');
    }
  }

  private async getOrThrow(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { case: true } });
    if (!payment) throw new NotFoundException(`Төлбөр ${id} олдсонгүй`);
    return payment;
  }
}
