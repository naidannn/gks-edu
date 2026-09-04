import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, ContractStatus, PaymentKind, PaymentStatus, type Prisma, Role } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { QPAY_POLL_INTERVAL_MS, QPAY_POLL_LIMIT, QPAY_POLL_QUEUE } from '../../queue/queue.constants.js';
import { CasesService } from '../cases/cases.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { QueryPaymentsDto } from './dto/query-payments.dto.js';
import { QpayClientService } from './qpay-client.service.js';

const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT] as const;

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
    @InjectQueue(QPAY_POLL_QUEUE) private readonly pollQueue: Queue,
  ) {}

  // ─── Creating an invoice (1C-12) ───────────────────────────────────────────

  /** Self-service by design (gksedu.md §5.5: the user pays via QPay) — staff may also create one on a case they don't own. */
  async createForCase(caseId: string, dto: CreatePaymentDto, actor: AuthenticatedUser) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId }, include: { contract: true } });
    if (!gksCase) throw new NotFoundException(`Case ${caseId} not found`);
    const isStaff = (STAFF_ROLES as readonly Role[]).includes(actor.role);
    if (!isStaff && gksCase.userId !== actor.id) {
      throw new ForbiddenException('Энэ хэрэгт төлбөр үүсгэх эрхгүй байна');
    }
    if (!gksCase.contract || gksCase.contract.status === ContractStatus.DRAFT) {
      throw new BadRequestException('Гэрээ гарын үсэг зураагүй тул төлбөр үүсгэх боломжгүй');
    }

    const existing = await this.prisma.payment.findFirst({ where: { caseId, kind: dto.kind } });
    if (existing?.status === PaymentStatus.PAID) {
      throw new BadRequestException(`${dto.kind} төлбөр аль хэдийн төлөгдсөн байна`);
    }
    if (existing?.status === PaymentStatus.PENDING) {
      return existing; // idempotent — same invoice/QR handed back rather than creating a duplicate
    }

    const targetStage = PROGRESS_TARGET[dto.kind];
    if (!targetStage) throw new BadRequestException(`${dto.kind} энэ endpoint-оор үүсгэгдэхгүй`);
    const canAdvance = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: gksCase.serviceType, fromStage: gksCase.stage, toStage: targetStage },
      },
    });
    if (!canAdvance?.isSystemOnly) {
      throw new BadRequestException(`Хэрэг одоогийн (${gksCase.stage}) шатандаа ${dto.kind} төлбөр хүлээж авахад бэлэн биш байна`);
    }

    const amountMnt = this.resolveAmount(dto.kind, gksCase.contract);

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

  // ─── Reading ────────────────────────────────────────────────────────────────

  async findAllStaff(query: QueryPaymentsDto) {
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
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
      this.logger.warn(`QPay webhook for unknown payment ${paymentId}`);
      return { ok: true };
    }
    if (payment.status !== PaymentStatus.PENDING || !payment.qpayInvoiceId) return { ok: true };

    const result = await this.qpay.checkPayment(payment.qpayInvoiceId);
    if (result.paid) await this.confirmPayment(paymentId, result.qpayPaymentId);
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
    if (result.paid) await this.confirmPayment(paymentId, result.qpayPaymentId);
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
   * (§5.5) — the same path for the webhook, the polling fallback, and the dev
   * shortcut.
   */
  async confirmPayment(paymentId: string, qpayPaymentId?: string) {
    const confirmed = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { case: { include: { contract: true } } } });
      if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
      if (payment.status === PaymentStatus.PAID) return payment;
      if (payment.status !== PaymentStatus.PENDING) {
        throw new BadRequestException(`${payment.status} төлөвт байгаа төлбөрийг баталгаажуулах боломжгүй`);
      }

      const updated = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.PAID, paidAt: new Date(), qpayPaymentId },
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
        paidAt: new Date(),
        refundOfId: original.id,
        createdById: actorId,
      },
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  private buildWhere(query: QueryPaymentsDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.kind) where.kind = query.kind;
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
    const isStaff = (STAFF_ROLES as readonly Role[]).includes(user.role);
    if (!isStaff && payment.case.userId !== user.id) {
      throw new ForbiddenException('Энэ төлбөрт хандах эрхгүй байна');
    }
  }

  private async getOrThrow(id: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id }, include: { case: true } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    return payment;
  }
}
