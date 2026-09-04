import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CaseStage, ContractStatus, PaymentKind, PaymentStatus, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
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
} = {}) {
  const gksCase = options.gksCase ?? makeCase();

  const prisma = {
    case: { findUnique: vi.fn().mockResolvedValue(gksCase) },
    payment: {
      findFirst: vi.fn().mockResolvedValue(options.existingPayment ?? null),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'payment-1', ...data })),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'payment-1', ...data })),
    },
    contract: { update: vi.fn() },
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
  } as unknown as QpayClientService;
  const config = { getOrThrow: vi.fn().mockReturnValue('http://localhost/callback'), get: vi.fn() } as unknown as ConfigService;
  const pollQueue = {
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
    removeJobScheduler: vi.fn().mockResolvedValue(true),
  } as unknown as Queue;

  const service = new PaymentsService(prismaTyped, cases, qpay, config, pollQueue);
  return { service, prisma: prismaTyped, cases, qpay, pollQueue };
}

const student: AuthenticatedUser = { id: 'student-1', email: 's@gks.edu', role: Role.USER };
const otherStudent: AuthenticatedUser = { id: 'student-2', email: 's2@gks.edu', role: Role.USER };
const staff: AuthenticatedUser = { id: 'staff-1', email: 'c@gks.edu', role: Role.CONSULTANT };

describe('PaymentsService.createForCase (1C-12, self-service per gksedu.md §5.5)', () => {
  it('lets the owning user create their own prepayment invoice', async () => {
    const { service, prisma, qpay, pollQueue } = buildHarness();

    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);

    expect(prisma.payment.create).toHaveBeenCalledWith({
      data: { caseId: 'case-1', kind: PaymentKind.PREPAYMENT, amountMnt: 200_000, status: PaymentStatus.PENDING },
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
    const { service, prisma, qpay } = buildHarness({ existingPayment: { id: 'payment-old', status: PaymentStatus.PENDING } });
    const result = await service.createForCase('case-1', { kind: PaymentKind.PREPAYMENT }, student);
    expect(result).toEqual({ id: 'payment-old', status: PaymentStatus.PENDING });
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(qpay.createInvoice).not.toHaveBeenCalled();
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

    await harness.service.confirmPayment('payment-1', 'qpay-payment-9');

    expect(harness.prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: expect.objectContaining({ status: PaymentStatus.PAID, qpayPaymentId: 'qpay-payment-9' }),
    });
    expect(harness.prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { status: ContractStatus.ACTIVE },
    });
    expect(harness.cases.applySystemTransition).toHaveBeenCalledWith(expect.anything(), 'case-1', CaseStage.PREPAYMENT_PAID);
    expect(harness.pollQueue.removeJobScheduler).toHaveBeenCalledWith('payment-1');
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

describe('PaymentsService.refund (1C-16)', () => {
  it('refuses to refund a payment that was never PAID', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PENDING, case: makeCase() });

    await expect(service.refund('payment-1', 'staff-1')).rejects.toThrow(BadRequestException);
  });

  it('refuses a second refund of the same payment', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({ id: 'payment-1', status: PaymentStatus.PAID, case: makeCase() });
    prisma.payment.findFirst.mockResolvedValue({ id: 'refund-already' });

    await expect(service.refund('payment-1', 'staff-1')).rejects.toThrow(BadRequestException);
  });

  it('creates a REFUND row referencing the original payment', async () => {
    const { service, prisma } = buildHarness();
    prisma.payment.findUnique.mockResolvedValue({
      id: 'payment-1',
      caseId: 'case-1',
      amountMnt: 1_000_000,
      status: PaymentStatus.PAID,
      case: makeCase(),
    });
    prisma.payment.findFirst.mockResolvedValue(null);

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
  });
});
