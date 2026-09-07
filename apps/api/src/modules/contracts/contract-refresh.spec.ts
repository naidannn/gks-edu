import { describe, expect, it, vi } from 'vitest';
import { BalanceTrigger, ContractStatus, ContractType, PrepaymentMode, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ContractsService } from './contracts.service.js';

const TEMPLATE = {
  id: 'template-1',
  bodyMn: 'Зуучлуулагч {{userName}} /РД: {{userRegister}}/, {{universityName}}, {{totalAmount}}₮, {{contractDate}}',
};

/** The client as the office first typed it — one digit wrong in the register. */
function client(registerNumber: string) {
  return {
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    registerNumber,
    birthDate: new Date('1998-04-17'),
    phone: '99112233',
    email: null,
    address: null,
    guardianLastName: null,
    guardianFirstName: null,
    guardianRegisterNumber: null,
    guardianRelation: null,
  };
}

function contractRow(overrides: { status?: ContractStatus; register?: string; bodyMn?: string } = {}) {
  return {
    id: 'contract-1',
    status: overrides.status ?? ContractStatus.DRAFT,
    type: ContractType.PHYSICAL,
    bodyMn: overrides.bodyMn ?? 'Зуучлуулагч Батбаяр Түвшин /РД: УБ12345678/, Сөүлийн Их Сургууль, 5,000,000.00₮, 2026-09-01',
    createdAt: new Date(2026, 8, 1),
    totalAmountSnapshot: 5_000_000,
    prepaymentModeSnapshot: PrepaymentMode.FIXED,
    prepaymentValueSnapshot: 1_500_000,
    balanceTriggerSnapshot: BalanceTrigger.AFTER_VISA_APPROVED,
    template: TEMPLATE,
    case: {
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      user: { name: 'Батбаяр Түвшин', email: null, phone: '99112233', client: client(overrides.register ?? 'УБ87654321') },
      university: { nameMn: 'Сөүлийн Их Сургууль' },
      universityChoices: [],
    },
  };
}

function serviceWith(rows: ReturnType<typeof contractRow>[]) {
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    contract: { findMany: vi.fn().mockResolvedValue(rows), update },
    contractTemplate: { findFirst: vi.fn().mockResolvedValue(TEMPLATE) },
  } as unknown as PrismaService;

  const stub = null as never;
  return { service: new ContractsService(prisma, stub, stub, stub, stub, stub, stub, stub), update };
}

describe('ContractsService.refreshUnsignedForUser (1C-30)', () => {
  it('rewrites an unsigned contract with the corrected register number', async () => {
    const { service, update } = serviceWith([contractRow()]);

    expect(await service.refreshUnsignedForUser('user-1')).toEqual({ refreshed: 1, locked: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { bodyMn: expect.stringContaining('/РД: УБ87654321/') },
    });
  });

  it('keeps the issue date and the money the contract was issued on', async () => {
    const { service, update } = serviceWith([contractRow()]);
    await service.refreshUnsignedForUser('user-1');

    const [{ data }] = (update as ReturnType<typeof vi.fn>).mock.calls[0] as [{ data: { bodyMn: string } }];
    expect(data.bodyMn).toContain('2026-09-01');
    expect(data.bodyMn).toContain('5,000,000.00₮');
  });

  it('never touches a signed contract — it counts it instead', async () => {
    const { service, update } = serviceWith([contractRow({ status: ContractStatus.SIGNED })]);

    expect(await service.refreshUnsignedForUser('user-1')).toEqual({ refreshed: 0, locked: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  it('stays quiet about a signed contract the correction would not have changed', async () => {
    const { service } = serviceWith([contractRow({ status: ContractStatus.SIGNED, register: 'УБ12345678' })]);

    expect(await service.refreshUnsignedForUser('user-1')).toEqual({ refreshed: 0, locked: 0 });
  });

  it('writes nothing when the correction changed nothing the contract says', async () => {
    const { service, update } = serviceWith([contractRow({ register: 'УБ12345678' })]);

    expect(await service.refreshUnsignedForUser('user-1')).toEqual({ refreshed: 0, locked: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('falls back to the active template for a contract issued before the version was recorded', async () => {
    const row = { ...contractRow(), template: null };
    const { service, update } = serviceWith([row as unknown as ReturnType<typeof contractRow>]);

    expect(await service.refreshUnsignedForUser('user-1')).toEqual({ refreshed: 1, locked: 0 });
    expect(update).toHaveBeenCalled();
  });
});
