import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, ContractStatus, PaymentKind, PaymentMethod, PaymentStatus, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { DEFAULT_PAYMENT_DUE_DAYS } from '../pricing/payment-terms.js';
import type { PricingService } from '../pricing/pricing.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { MetaEventsService } from '../meta/meta-events.service.js';
import { PaymentsService } from './payments.service.js';
import type { QpayClientService } from './qpay-client.service.js';

const contractSnapshot = {
  id: 'contract-1',
  status: ContractStatus.SIGNED,
  totalAmountSnapshot: { toString: () => '1200000' },
  prepaymentModeSnapshot: 'FIXED',
  prepaymentValueSnapshot: { toString: () => '200000' },
};

function makeCase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    code: 'GKS-2026-0001',
    userId: 'student-1',
    serviceType: ServiceType.LANGUAGE_PREP,
    stage: CaseStage.CONTRACT_SIGNED,
    contract: contractSnapshot,
    ...overrides,
  };
}

function buildHarness(options: {
  gksCase?: Record<string, unknown>;
  existingPayment?: Record<string, unknown> | null;
  flowRule?: Record<string, unknown> | null;
  paymentDueDays?: number;
} = {}) {
  const gksCase = options.gksCase ?? makeCase();

  const prisma = {
    case: { findUnique: vi.fn().mockResolvedValue(gksCase) },
    payment: {
      findFirst: vi.fn().mockResolvedValue(options.existingPayment ?? null),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'payment-1', ...data })),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'payment-1', ...data })),
      // `confirmPayment` claims the row with a conditional update, so the fake
      // has to honour the condition the way Postgres would — otherwise a row
      // that is already PAID would still look claimable here.
      updateMany: vi.fn().mockImplementation(async ({ where }: { where: { id: string; status: string } }) => {
        const row = (await prisma.payment.findUnique({ where: { id: where.id } })) as { status?: string } | null;
        return { count: row?.status === where.status ? 1 : 0 };
      }),
      findUniqueOrThrow: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        prisma.payment.findUnique({ where }),
      ),
      count: vi.fn(),
    },
    contract: { update: vi.fn() },
    // Read only to enrich the Meta conversion (1A-38); no test asserts on it.
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'student-1', email: 's@gks.edu', phone: null, name: null, client: null }) },
    caseFlowDefinition: {
      findUnique: vi.fn().mockResolvedValue(options.flowRule === undefined ? { isSystemOnly: true } : options.flowRule),
    },
    $transaction: vi.fn().mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };
  const prismaTyped = prisma as unknown as PrismaService & typeof prisma;

  const cases = { applySystemTransition: vi.fn().mockResolvedValue(undefined) } as unknown as CasesService;
  const qpay = {
    createInvoice: vi.fn().mockResolvedValue({ invoiceId: 'MOCK-1', qrText: 'mock-qr', qrImage: null }),
    checkPayment: vi.fn(),
    cancelInvoice: vi.fn().mockResolvedValue(undefined),
  } as unknown as QpayClientService;
  const config = { getOrThrow: vi.fn().mockReturnValue('http://localhost/callback'), get: vi.fn() } as unknown as ConfigService;
  const pollQueue = {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  } as unknown as Queue;

  const notifications = { dispatch: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;

  const slack = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService;

  const storage = {
    upload: vi.fn().mockResolvedValue({ path: 'cases/case-1/PAYMENT_RECEIPT/1-abc.pdf' }),
    sign: vi.fn().mockReturnValue({ token: 'signed-token', expiresAt: new Date() }),
  } as unknown as StorageService;

  const pricing = {
    getActive: vi.fn().mockResolvedValue({ paymentDueDays: options.paymentDueDays ?? 7 }),
  } as unknown as PricingService;

  const meta = { track: vi.fn().mockResolvedValue(undefined) } as unknown as MetaEventsService;

  const service = new PaymentsService(
    prismaTyped, cases, qpay, config, notifications, slack, storage, pricing, meta, pollQueue,
  );
  return { service, prisma: prismaTyped, cases, qpay, pollQueue, notifications, slack, storage, pricing, meta };
}

const student: AuthenticatedUser = { id: 'student-1', email: 's@gks.edu', role: Role.USER };
const otherStudent: AuthenticatedUser = { id: 'student-2', email: 's2@gks.edu', role: Role.USER };
const staff: AuthenticatedUser = { id: 'staff-1', email: 'c@gks.edu', role: Role.CONSULTANT };

describe('PaymentsService.createForCase (1C-12, self-service per gksedu.md §5.5)', () => {
  it('lets the owning user create their own prepayment invoice', async () => {
    const { service, prisma, qpay, pollQueue } = buildHarness();

    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: {
        caseId: 'case-1',
        kind: PaymentKind.PREPAYMENT,
        amountMnt: 200_000,
        status: PaymentStatus.PENDING,
        dueAt: expect.any(Date),
      },
    });
    expect(qpay.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNo: 'payment-1', amount: 200_000 }),
    );
    expect(pollQueue.upsertJobScheduler).toHaveBeenCalledWith('payment-1', expect.any(Object), {
      data: { paymentId: 'payment-1' },
    });
    expect(result).toMatchObject({ qpayInvoiceId: 'MOCK-1' });
  });

  it('blocks a user from invoicing someone else`s case', async () => {
    const { service } = buildHarness();
    await expect(service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, otherStudent)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('lets staff create an invoice on any case', async () => {
    const { service, prisma } = buildHarness();
    await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, staff);
    expect(prisma.payment.create).toHaveBeenCalled();
  });

  it('refuses when the contract is still a DRAFT', async () => {
    const { service } = buildHarness({ gksCase: makeCase({ contract: { ...contractSnapshot, status: ContractStatus.DRAFT } }) });
    await expect(service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('hands back the existing PENDING invoice instead of creating a duplicate', async () => {
    const { service, prisma, qpay } = buildHarness({
      existingPayment: { id: 'payment-old', status: PaymentStatus.PENDING, qpayInvoiceId: 'MOCK-old' },
    });
    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);
    expect(result).toMatchObject({ id: 'payment-old', qpayInvoiceId: 'MOCK-old' });
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(qpay.createInvoice).not.toHaveBeenCalled();
  });

  it('only ever looks at a live row, so a refunded prepayment does not block a new one (1N-08)', async () => {
    const { service, prisma } = buildHarness();

    await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(prisma.payment.findFirst).toHaveBeenCalledWith({
      where: { caseId: 'case-1', kind: PaymentKind.PREPAYMENT, status: { in: [PaymentStatus.PENDING, PaymentStatus.PAID] } },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('retries a PENDING row that QPay never gave an invoice to, instead of returning it forever (1N-09)', async () => {
    // The wreckage of a QPay outage: nothing for the client to scan, and the
    // partial unique index means no second row can be created either.
    const { service, prisma, qpay } = buildHarness({
      existingPayment: { id: 'payment-dead', status: PaymentStatus.PENDING, qpayInvoiceId: null },
    });

    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(qpay.createInvoice).toHaveBeenCalledWith(expect.objectContaining({ invoiceNo: 'payment-dead' }));
    expect(result).toMatchObject({ qpayInvoiceId: 'MOCK-1' });
  });

  it('fails the row when QPay refuses, so the client can try again (1N-09)', async () => {
    const { service, prisma, qpay } = buildHarness();
    vi.mocked(qpay.createInvoice).mockRejectedValue(new Error('QPay 502'));

    await expect(service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student)).rejects.toThrow('QPay 502');

    // PENDING is what the (caseId, kind) index holds against every later
    // attempt; FAILED frees it.
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.FAILED },
    });
  });

  it('hands back the winner`s row when two clicks race the index (1N-09)', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    prisma.payment.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'payment-winner', status: PaymentStatus.PENDING, qpayInvoiceId: 'MOCK-w' });

    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(result).toMatchObject({ id: 'payment-winner' });
  });

  /**
   * The end of the UTC day `days` from now — exactly what `paymentDueAt` writes.
   *
   * Asserted as a date rather than as a rounded day count: the window is
   * measured to the end of its last day, so `(dueAt - now) / 86_400_000` is a
   * fraction that rounds to 10 in the afternoon and to 11 in the morning. That
   * made the suite pass or fail on the hour it happened to run.
   */
  function endOfDayInDays(days: number): number {
    const due = new Date(Date.now() + days * 86_400_000);
    due.setUTCHours(23, 59, 59, 999);
    return due.getTime();
  }

  it('gives the invoice a due date, so the reminder and the receivables report have one to run on', async () => {
    // The regression this guards: `Payment.dueAt` had four readers — the
    // "Төлбөрийн хугацаа болсон" sweep, the receivables count, mv_finance and
    // the portal's overdue badge — and no writer, so all four reported zero.
    const { service, prisma, pricing } = buildHarness({ paymentDueDays: 10 });

    await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(pricing.getActive).toHaveBeenCalledWith(ServiceType.LANGUAGE_PREP);
    const { dueAt } = prisma.payment.create.mock.calls[0]![0].data as { dueAt: Date };
    expect(dueAt.getTime()).toBe(endOfDayInDays(10));
  });

  it('still raises the invoice when the service has no active price, on the default window', async () => {
    // A mis-configured price must not stop the office invoicing a contract that
    // is already signed — but the payment still needs a date to be chased on.
    const { service, prisma, pricing } = buildHarness();
    vi.mocked(pricing.getActive).mockRejectedValue(new NotFoundException('идэвхтэй үнэ алга'));

    await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    const { dueAt } = prisma.payment.create.mock.calls[0]![0].data as { dueAt: Date };
    expect(dueAt.getTime()).toBe(endOfDayInDays(DEFAULT_PAYMENT_DUE_DAYS));
  });

  it('refuses a second prepayment once one is already PAID', async () => {
    const { service } = buildHarness({ existingPayment: { id: 'payment-old', status: PaymentStatus.PAID } });
    await expect(service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('refuses BALANCE before the case has reached the stage its flow allows it (1C-04 gate)', async () => {
    const { service } = buildHarness({ flowRule: null });
    await expect(service.createForCase('case-1', { kind: PaymentKind.BALANCE }, student)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('PaymentsService.confirmPayment (1C-15 — payment confirmed advances the case)', () => {
  let harness: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    harness = buildHarness();
  });

  it('is a no-op when the payment is already PAID (webhook + poll can both fire)', async () => {
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PAID,
      kind: PaymentKind.PREPAYMENT,
      case: makeCase(),
    });

    await harness.service.confirmPayment('payment-1');

    expect(harness.cases.applySystemTransition).not.toHaveBeenCalled();
    expect(harness.pollQueue.removeJobScheduler).toHaveBeenCalledWith('payment-1');
  });

  it('rejects confirming a FAILED/EXPIRED payment', async () => {
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.FAILED,
      kind: PaymentKind.PREPAYMENT,
      case: makeCase(),
    });

    await expect(harness.service.confirmPayment('payment-1')).rejects.toThrow(BadRequestException);
  });

  it('marks PREPAYMENT paid, activates the contract, and advances the case', async () => {
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.confirmPayment('payment-1', { qpayPaymentId: 'qpay-payment-9' });

    expect(harness.prisma.payment.updateMany).toHaveBeenCalledWith({
      // Conditional on PENDING: the webhook and the poller both fire on this
      // payment, and only one of them may credit it.
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: expect.objectContaining({ status: PaymentStatus.PAID, qpayPaymentId: 'qpay-payment-9' }),
    });
    expect(harness.prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: ContractStatus.ACTIVE },
    });
    expect(harness.cases.applySystemTransition).toHaveBeenCalledWith(expect.anything(), 'case-1', CaseStage.PREPAYMENT_PAID);
    expect(harness.pollQueue.removeJobScheduler).toHaveBeenCalledWith('payment-1');
  });

  it('credits the money once when the webhook and the poller land together', async () => {
    // Both confirm paths fire on the same payment within milliseconds. The
    // claim is conditional on PENDING, so the loser finds nothing to update
    // and takes the already-paid exit instead of transitioning the case a
    // second time and thanking the client twice.
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });
    harness.prisma.payment.updateMany.mockResolvedValue({ count: 0 });
    harness.prisma.payment.findUnique.mockResolvedValueOnce({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PAID,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.confirmPayment('payment-1', { qpayPaymentId: 'qpay-payment-9' });

    expect(harness.cases.applySystemTransition).not.toHaveBeenCalled();
    expect(harness.notifications.dispatch).not.toHaveBeenCalled();
  });

  it('keeps the money when the stage graph refuses the move (1N-07)', async () => {
    // The case was put on hold while the client was paying. The stage cannot
    // move — but QPay has taken the money, and rolling the payment back would
    // make the webhook 500 and the poller retry the same failure until it gives
    // up, with the client's ₮ gone and no row to show for it.
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase({ stage: CaseStage.ON_HOLD }),
    });
    vi.mocked(harness.cases.applySystemTransition).mockRejectedValue(
      new BadRequestException('Түр зогссон -> Урьдчилгаа төлсөн системийн шилжилт биш'),
    );

    await expect(harness.service.confirmPayment('payment-1', { qpayPaymentId: 'qpay-9' })).resolves.toBeDefined();

    expect(harness.prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: expect.objectContaining({ status: PaymentStatus.PAID }),
    });
    // Nobody is going to notice a log line, so the office is told.
    expect(harness.slack.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Төлбөр орсон ч үе шат хөдөлсөнгүй' }),
    );
  });

  it('does not touch the contract for a BALANCE payment', async () => {
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-2',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.BALANCE,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.confirmPayment('payment-2');

    expect(harness.prisma.contract.update).not.toHaveBeenCalled();
    expect(harness.cases.applySystemTransition).toHaveBeenCalledWith(expect.anything(), 'case-1', CaseStage.BALANCE_PAID);
  });
});

describe('PaymentsService.registerManual (1C-27 — money that never went through QPay)', () => {
  const bankTransfer = {
    kind: PaymentKind.PREPAYMENT,
    method: PaymentMethod.BANK_TRANSFER,
    paidAt: '2026-09-01T00:00:00.000Z',
    reference: 'TRX-88',
  } as const;

  it('creates a row on the chosen channel and confirms it through the QPay path', async () => {
    const harness = buildHarness({ existingPayment: null });
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.registerManual('case-1', { ...bankTransfer }, 'staff-1');

    expect(harness.prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1',
        kind: PaymentKind.PREPAYMENT,
        method: PaymentMethod.BANK_TRANSFER,
        reference: 'TRX-88',
        createdById: 'staff-1',
        // Born PENDING so `confirmPayment` runs the one path that advances the case.
        status: PaymentStatus.PENDING,
      }),
    });
    // The amount is the contract's, never the operator's.
    expect(harness.prisma.payment.create.mock.calls[0]![0].data.amountMnt).toBe(200_000);
    expect(harness.cases.applySystemTransition).toHaveBeenCalledWith(expect.anything(), 'case-1', CaseStage.PREPAYMENT_PAID);
    expect(harness.qpay.createInvoice).not.toHaveBeenCalled();
  });

  it('records the date the money arrived, not the date it was typed in', async () => {
    const harness = buildHarness({ existingPayment: null });
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.registerManual('case-1', { ...bankTransfer }, 'staff-1');

    expect(harness.prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: expect.objectContaining({ status: PaymentStatus.PAID, paidAt: new Date('2026-09-01T00:00:00.000Z') }),
    });
  });

  it('converts a pending QPay invoice instead of billing the client twice', async () => {
    const harness = buildHarness({ existingPayment: { id: 'payment-1', status: PaymentStatus.PENDING, kind: PaymentKind.PREPAYMENT } });
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.registerManual('case-1', { ...bankTransfer, method: PaymentMethod.CASH }, 'staff-1');

    expect(harness.prisma.payment.create).not.toHaveBeenCalled();
    expect(harness.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({ method: PaymentMethod.CASH }),
    });
    expect(harness.pollQueue.removeJobScheduler).toHaveBeenCalledWith('payment-1');
  });

  it('kills the QR when it converts a QPay row, so the client cannot pay twice (1N-10)', async () => {
    const harness = buildHarness({
      existingPayment: {
        id: 'payment-1',
        status: PaymentStatus.PENDING,
        kind: PaymentKind.PREPAYMENT,
        qpayInvoiceId: 'MOCK-1',
      },
    });
    harness.prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      status: PaymentStatus.PENDING,
      kind: PaymentKind.PREPAYMENT,
      caseId: 'case-1',
      case: makeCase(),
    });

    await harness.service.registerManual('case-1', { ...bankTransfer, method: PaymentMethod.CASH }, 'staff-1');

    // §6.4: a QR left alive is scannable tomorrow, for money already handed
    // over at the desk today.
    expect(harness.qpay.cancelInvoice).toHaveBeenCalledWith('MOCK-1');
  });

  it('refuses a kind that is already paid', async () => {
    const harness = buildHarness({ existingPayment: { id: 'payment-1', status: PaymentStatus.PAID, kind: PaymentKind.PREPAYMENT } });

    await expect(harness.service.registerManual('case-1', { ...bankTransfer }, 'staff-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses a future date', async () => {
    const harness = buildHarness({ existingPayment: null });
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    await expect(
      harness.service.registerManual('case-1', { ...bankTransfer, paidAt: tomorrow }, 'staff-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('will not let a bank transfer skip a stage the case flow does not allow', async () => {
    const harness = buildHarness({ existingPayment: null, flowRule: null });

    await expect(harness.service.registerManual('case-1', { ...bankTransfer }, 'staff-1')).rejects.toThrow(BadRequestException);
    expect(harness.prisma.payment.create).not.toHaveBeenCalled();
  });

  it('stores the receipt before confirming, so a rejected file leaves no paid row', async () => {
    const harness = buildHarness({ existingPayment: null });
    harness.storage.upload = vi.fn().mockRejectedValue(new BadRequestException('Зөвшөөрөгдөөгүй файлын төрөл'));

    await expect(
      harness.service.registerManual('case-1', { ...bankTransfer }, 'staff-1', Buffer.from('not-a-pdf')),
    ).rejects.toThrow(BadRequestException);
    expect(harness.prisma.payment.create).not.toHaveBeenCalled();
    expect(harness.cases.applySystemTransition).not.toHaveBeenCalled();
  });
});

describe('PaymentsService.refund (1C-16)', () => {
  it('refuses to refund a payment that was never PAID', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PENDING, case: makeCase() });

    await expect(service.refund('payment-1', 'staff-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses to refund a refund', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'refund-1',
      kind: PaymentKind.REFUND,
      status: PaymentStatus.PAID,
      case: makeCase(),
    });

    await expect(service.refund('refund-1', 'staff-1')).rejects.toThrow(BadRequestException);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it('turns a lost race against the unique index into a 409, not a second refund', async () => {
    // Two "Буцаах" clicks: the index is the guard, so the loser is told the
    // money has already gone back rather than sending it twice (1N-08).
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      kind: PaymentKind.PREPAYMENT,
      status: PaymentStatus.PAID,
      case: makeCase(),
    });
    prisma.payment.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(service.refund('payment-1', 'staff-1')).rejects.toThrow(ConflictException);
  });

  it('creates a REFUND row referencing the original, and marks the original REFUNDED', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      caseId: 'case-1',
      kind: PaymentKind.PREPAYMENT,
      amountMnt: 1_000_000,
      status: PaymentStatus.PAID,
      case: makeCase(),
    });

    await service.refund('payment-1', 'staff-1');

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case-1',
        kind: PaymentKind.REFUND,
        amountMnt: 1_000_000,
        status: PaymentStatus.PAID,
        refundOfId: 'payment-1',
        createdById: 'staff-1',
      }),
    });
    // Without this the original still reads as money we hold, and
    // `PaymentStatus.REFUNDED` stays a value nothing ever writes.
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: { status: PaymentStatus.REFUNDED },
    });
  });
});

describe('PaymentsService.findOne — what a client may read (1N-04)', () => {
  const staffOnlyRow = {
    id: 'payment-1',
    caseId: 'case-1',
    kind: PaymentKind.PREPAYMENT,
    amountMnt: 200_000,
    status: PaymentStatus.PAID,
    method: PaymentMethod.CASH,
    reference: 'TRX-88',
    qpayInvoiceId: null,
    qrText: null,
    qrImage: null,
    paidAt: new Date('2026-09-01'),
    dueAt: null,
    refundOfId: null,
    createdAt: new Date('2026-09-01'),
    // None of these four are the client's business.
    note: 'Ээж нь оффист бэлнээр авчирсан',
    receiptPath: 'cases/case-1/PAYMENT_RECEIPT/1-abc.pdf',
    createdById: 'staff-1',
    qpayPaymentId: 'qpay-9',
    case: makeCase(),
  };

  it('gives the owning client the invoice without the desk notes behind it', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue(staffOnlyRow);

    const result = (await service.findOne('payment-1', student)) as Record<string, unknown>;

    expect(result).toMatchObject({ id: 'payment-1', amountMnt: 200_000, status: PaymentStatus.PAID });
    for (const staffField of ['note', 'receiptPath', 'createdById', 'qpayPaymentId', 'case']) {
      expect(result).not.toHaveProperty(staffField);
    }
  });

  it('gives staff the whole row', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue(staffOnlyRow);

    const result = (await service.findOne('payment-1', staff)) as Record<string, unknown>;

    expect(result.note).toBe('Ээж нь оффист бэлнээр авчирсан');
    expect(result.qpayPaymentId).toBe('qpay-9');
  });

  it('still refuses somebody else`s payment outright', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue(staffOnlyRow);

    await expect(service.findOne('payment-1', otherStudent)).rejects.toThrow(ForbiddenException);
  });
});

describe('PaymentsService — QPay invoice hygiene (1N-09, 1N-10)', () => {
  function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'payment-1',
      caseId: 'case-1',
      kind: PaymentKind.PREPAYMENT,
      amountMnt: 200_000,
      status: PaymentStatus.PENDING,
      qpayInvoiceId: 'MOCK-1',
      qpayPaymentId: null,
      createdAt: new Date(Date.now() - 60_000),
      case: makeCase(),
      ...overrides,
    };
  }

  it('expires a QR the poller has given up on, and takes QPay`s copy down with it', async () => {
    const harness = buildHarness();
    harness.prisma.payment.findUnique.mockResolvedValue(
      pendingRow({ createdAt: new Date(Date.now() - 60 * 60 * 1000) }),
    );
    vi.mocked(harness.qpay.checkPayment).mockResolvedValue({ paid: false });

    await harness.service.pollOnce('payment-1');

    // PENDING holds the (caseId, kind) slot; without expiring it the client can
    // never be handed a fresh QR.
    expect(harness.prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'payment-1', status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.EXPIRED },
    });
    expect(harness.qpay.cancelInvoice).toHaveBeenCalledWith('MOCK-1');
    expect(harness.pollQueue.removeJobScheduler).toHaveBeenCalledWith('payment-1');
  });

  it('leaves a QR alone while its schedule is still running', async () => {
    const harness = buildHarness();
    harness.prisma.payment.findUnique.mockResolvedValue(pendingRow());
    vi.mocked(harness.qpay.checkPayment).mockResolvedValue({ paid: false });

    await harness.service.pollOnce('payment-1');

    expect(harness.qpay.cancelInvoice).not.toHaveBeenCalled();
  });

  it('will not credit a debt on less money than it asked for', async () => {
    const harness = buildHarness();
    harness.prisma.payment.findUnique.mockResolvedValue(pendingRow());
    vi.mocked(harness.qpay.checkPayment).mockResolvedValue({ paid: true, qpayPaymentId: 'qpay-9', paidAmount: 50_000 });

    await harness.service.handleWebhook('payment-1');

    expect(harness.prisma.payment.updateMany).not.toHaveBeenCalled();
    expect(harness.slack.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'QPay дутуу төлбөр ирлээ' }));
  });
});
