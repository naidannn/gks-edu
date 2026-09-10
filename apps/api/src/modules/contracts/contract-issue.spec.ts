import { BadRequestException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StorageService } from '../../storage/storage.service.js';
import {
  BalanceTrigger,
  CaseStage,
  ContractStatus,
  ContractType,
  PrepaymentMode,
  Role,
  ServiceType,
} from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { PricingService } from '../pricing/pricing.service.js';
import type { ContractPdfService } from './contract-pdf.service.js';
import { ContractsService } from './contracts.service.js';

const TEMPLATE = { id: 'template-1', version: 3, bodyMn: '{{userName}} — {{contractDate}} / {{signatureDate}}' };

const PRICING = {
  totalAmount: 5_000_000,
  prepaymentMode: PrepaymentMode.FIXED,
  prepaymentValue: 1_500_000,
  balanceTrigger: BalanceTrigger.AFTER_VISA_APPROVED,
};

function caseRow() {
  return {
    id: 'case-1',
    userId: 'user-1',
    serviceType: ServiceType.GKS_SCHOLARSHIP,
    stage: CaseStage.CONTRACT_DRAFT,
    contract: null,
    university: { nameMn: 'Сөүлийн Их Сургууль' },
    universityChoices: [],
    user: {
      name: 'Батбаяр Түвшин',
      email: 'tuvshin@example.mn',
      phone: '99112233',
      client: {
        lastName: 'Батбаяр',
        firstName: 'Түвшин',
        registerNumber: 'УБ12345678',
        birthDate: new Date('1998-04-17T00:00:00.000Z'),
        phone: '99112233',
        email: null,
        address: null,
        guardianLastName: null,
        guardianFirstName: null,
        guardianRegisterNumber: null,
        guardianRelation: null,
      },
    },
  };
}

function issuingHarness(options: { issuedThisYear?: number; takenNumbers?: string[]; createFails?: number } = {}) {
  const taken = new Set(options.takenNumbers ?? []);
  let failuresLeft = options.createFails ?? 0;

  const prisma = {
    case: { findUnique: vi.fn().mockResolvedValue(caseRow()) },
    contractTemplate: { findFirst: vi.fn().mockResolvedValue(TEMPLATE) },
    contract: {
      count: vi.fn().mockResolvedValue(options.issuedThisYear ?? 0),
      findUnique: vi.fn().mockImplementation(({ where }: { where: { number: string } }) =>
        Promise.resolve(taken.has(where.number) ? { id: 'other' } : null),
      ),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        if (failuresLeft > 0) {
          failuresLeft -= 1;
          return Promise.reject(Object.assign(new Error('unique'), { code: 'P2002' }));
        }
        return Promise.resolve({ id: 'contract-1', ...data });
      }),
    },
  } as unknown as PrismaService & { contract: { count: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } };

  const pricing = { getActive: vi.fn().mockResolvedValue(PRICING) } as unknown as PricingService;
  const stub = null as never;
  const service = new ContractsService(prisma, stub, pricing, stub, stub, stub, stub, stub, stub);
  return { service, prisma };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ContractsService.createForCase — the number and the dates are the office`s (1N-11)', () => {
  it('numbers a contract issued on 31 December 20:00 UTC into the new year, and prints the new year on it', async () => {
    // UTC+8: it is already 1 January in the office, so СГ/26/… would be last
    // year's sequence on a contract dated tomorrow.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T20:00:00.000Z'));
    const { service, prisma } = issuingHarness({ issuedThisYear: 0 });

    const created = (await service.createForCase({ caseId: 'case-1', type: ContractType.ELECTRONIC })) as {
      number: string;
      bodyMn: string;
    };

    expect(created.number).toBe('СГ/27/001');
    expect(created.bodyMn).toContain('2027-01-01');
    expect(created.bodyMn).toContain('2027/01/01');
    // And the count that produced the sequence ran over the office's year.
    const { where } = prisma.contract.count.mock.calls[0]![0] as { where: { createdAt: { gte: Date; lt: Date } } };
    expect(where.createdAt.gte.toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(where.createdAt.lt.toISOString()).toBe('2027-12-31T16:00:00.000Z');
  });

  it('takes the next free number when the index says somebody got there first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T03:00:00.000Z'));
    // The read said 001 was free; the write disagreed.
    const { service, prisma } = issuingHarness({ issuedThisYear: 0, createFails: 1 });

    const created = (await service.createForCase({ caseId: 'case-1', type: ContractType.ELECTRONIC })) as {
      number: string;
    };

    expect(created.number).toBe('СГ/26/002');
    expect(prisma.contract.create).toHaveBeenCalledTimes(2);
  });
});

// ─── Signing guards (1N-12) ──────────────────────────────────────────────────

function signingHarness(status: ContractStatus, type: ContractType = ContractType.PHYSICAL) {
  const contract = {
    id: 'contract-1',
    caseId: 'case-1',
    userId: 'user-1',
    number: 'СГ/26/001',
    type,
    status,
    bodyMn: 'Гэрээний бие',
    createdAt: new Date('2026-09-01T03:00:00.000Z'),
    acceptedAt: new Date('2026-09-01T03:00:00.000Z'),
    physicalScanPath: 'cases/case-1/CONTRACT_SCAN/old.pdf',
    case: { userId: 'user-1', code: 'GKS-2026-0001', serviceType: ServiceType.GKS_SCHOLARSHIP },
  };

  const update = vi.fn().mockResolvedValue(contract);
  const prisma = {
    contract: {
      findUnique: vi.fn().mockResolvedValue(contract),
      findUniqueOrThrow: vi.fn().mockResolvedValue(contract),
      update,
    },
    $transaction: vi.fn().mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  const storage = { upload: vi.fn().mockResolvedValue({ path: 'cases/case-1/CONTRACT_SCAN/new.pdf' }) } as unknown as StorageService;
  const pdf = { render: vi.fn().mockResolvedValue(Buffer.from('pdf')) } as unknown as ContractPdfService;
  const cases = { applySystemTransition: vi.fn().mockResolvedValue(undefined) } as unknown as CasesService;
  const notifications = { dispatch: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
  const slack = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService;
  const stub = null as never;

  const service = new ContractsService(
    prisma as unknown as PrismaService,
    cases,
    stub,
    pdf,
    storage,
    stub,
    stub,
    notifications,
    slack,
  );
  return { service, prisma, storage, update };
}

describe('ContractsService.registerPhysical — a paper contract is registered once (1N-12)', () => {
  const dto = { signedAt: '2026-09-02T00:00:00.000Z' };

  it('refuses a re-post on a contract that is already active', async () => {
    // Rejecting only SIGNED let ACTIVE, COMPLETED and TERMINATED through, and
    // the scan was overwritten before the stage move failed.
    const { service, storage, update } = signingHarness(ContractStatus.ACTIVE);

    await expect(service.registerPhysical('contract-1', dto, Buffer.from('scan'))).rejects.toThrow(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('registers a DRAFT, writing the scan with the signature rather than in front of it', async () => {
    const { service, update } = signingHarness(ContractStatus.DRAFT);

    await service.registerPhysical('contract-1', dto, Buffer.from('scan'));

    // One write, inside the signing transaction: a stage move that fails must
    // not leave a scan on a contract nobody registered.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: expect.objectContaining({
        status: ContractStatus.SIGNED,
        physicalScanPath: 'cases/case-1/CONTRACT_SCAN/new.pdf',
      }),
    });
  });
});

describe('ContractsService.accept — no fresh OTP for a contract already in force (1N-12)', () => {
  it('refuses an ACTIVE electronic contract', async () => {
    const { service } = signingHarness(ContractStatus.ACTIVE, ContractType.ELECTRONIC);

    await expect(service.accept('contract-1', { id: 'user-1', email: 'tuvshin@example.mn', role: Role.USER })).rejects.toThrow(
      BadRequestException,
    );
  });
});
