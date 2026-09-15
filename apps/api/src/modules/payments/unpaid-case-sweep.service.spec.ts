import { describe, expect, it, vi } from 'vitest';
import { CaseStage, ContractStatus } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AdmissionConfigService } from '../admissions/admission-config.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { PaymentsService } from './payments.service.js';
import { UnpaidCaseSweepService, lastMovementAt } from './unpaid-case-sweep.service.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-15T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

function caseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    code: 'GKS-2026-0001',
    stage: CaseStage.CONTRACT_DRAFT,
    createdAt: daysAgo(10),
    contract: null,
    transitions: [],
    payments: [],
    user: { name: 'Бат Болд', client: { lastName: 'Бат', firstName: 'Болд' } },
    ...overrides,
  };
}

function setup(options: { rows: unknown[]; days?: number; paid?: boolean; cancelFails?: boolean }) {
  const tx = { contract: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const prisma = {
    case: { findMany: vi.fn().mockResolvedValue(options.rows) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const config = { get: vi.fn().mockResolvedValue({ unpaidCaseCancelDays: options.days ?? 3 }) };
  const cases = {
    cancelBySystem: options.cancelFails
      ? vi.fn().mockRejectedValue(new Error('stage moved'))
      : vi.fn().mockResolvedValue(undefined),
  };
  const payments = { settleBeforeCancel: vi.fn().mockResolvedValue(options.paid ?? false) };
  const slack = { notify: vi.fn().mockResolvedValue(undefined) };

  const service = new UnpaidCaseSweepService(
    prisma as unknown as PrismaService,
    config as unknown as AdmissionConfigService,
    cases as unknown as CasesService,
    payments as unknown as PaymentsService,
    slack as unknown as SlackService,
  );
  return { service, prisma, tx, cases, payments, slack };
}

describe('lastMovementAt (1C-43)', () => {
  it('is the registration date when nothing else happened', () => {
    expect(lastMovementAt(caseRow() as never)).toEqual(daysAgo(10));
  });

  it('takes the latest of contract, transition and invoice dates', () => {
    const row = caseRow({
      contract: { createdAt: daysAgo(9), sentAt: daysAgo(8), acceptedAt: null, otpVerifiedAt: null, signedAt: daysAgo(2) },
      transitions: [{ createdAt: daysAgo(5) }],
      payments: [{ createdAt: daysAgo(4) }],
    });
    expect(lastMovementAt(row as never)).toEqual(daysAgo(2));
  });
});

describe('UnpaidCaseSweepService (1C-43)', () => {
  it('cancels a quiet unpaid case and terminates its contract', async () => {
    const { service, tx, cases, slack } = setup({ rows: [caseRow()] });

    const result = await service.sweep(NOW);

    expect(result.cancelled).toEqual(['GKS-2026-0001']);
    expect(tx.contract.updateMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1', status: { in: [ContractStatus.DRAFT, ContractStatus.SENT, ContractStatus.SIGNED] } },
      data: { status: ContractStatus.TERMINATED },
    });
    expect(cases.cancelBySystem).toHaveBeenCalledWith(tx, 'case-1', CaseStage.CONTRACT_DRAFT, expect.stringContaining('3 хоног'));
    expect(slack.notify).toHaveBeenCalledOnce();
  });

  it('leaves a case alone whose contract was signed inside the window', async () => {
    const row = caseRow({
      stage: CaseStage.CONTRACT_SIGNED,
      contract: { createdAt: daysAgo(10), sentAt: null, acceptedAt: null, otpVerifiedAt: null, signedAt: daysAgo(1) },
    });
    const { service, cases, payments } = setup({ rows: [row] });

    const result = await service.sweep(NOW);

    expect(result.cancelled).toEqual([]);
    expect(payments.settleBeforeCancel).not.toHaveBeenCalled();
    expect(cases.cancelBySystem).not.toHaveBeenCalled();
  });

  it('waits out an invoice due date the client was already shown', async () => {
    const row = caseRow({ payments: [{ createdAt: daysAgo(4), dueAt: new Date(NOW.getTime() + 6 * 60 * 60 * 1000) }] });
    const { service, cases } = setup({ rows: [row] });

    const result = await service.sweep(NOW);

    expect(result.cancelled).toEqual([]);
    expect(cases.cancelBySystem).not.toHaveBeenCalled();
  });

  it('does not cancel when QPay says the money is in after all', async () => {
    const { service, cases } = setup({ rows: [caseRow()], paid: true });

    const result = await service.sweep(NOW);

    expect(result).toEqual({ cancelled: [], paid: ['GKS-2026-0001'], failed: [] });
    expect(cases.cancelBySystem).not.toHaveBeenCalled();
  });

  it('is switched off by 0 days', async () => {
    const { service, prisma } = setup({ rows: [caseRow()], days: 0 });

    await service.sweep(NOW);

    expect(prisma.case.findMany).not.toHaveBeenCalled();
  });

  it('keeps going past a case that fails', async () => {
    const { service, slack } = setup({ rows: [caseRow(), caseRow({ id: 'case-2', code: 'GKS-2026-0002' })], cancelFails: true });

    const result = await service.sweep(NOW);

    expect(result.failed).toEqual(['GKS-2026-0001', 'GKS-2026-0002']);
    expect(slack.notify).not.toHaveBeenCalled();
  });
});
