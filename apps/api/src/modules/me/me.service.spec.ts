import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ContractType, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { ClientsService } from '../clients/clients.service.js';
import type { ContractsService } from '../contracts/contracts.service.js';
import type { CaseDocumentsService } from '../documents/case-documents.service.js';
import type { PricingService } from '../pricing/pricing.service.js';
import { MeService } from './me.service.js';

/** A profile complete enough to be named on a contract (1B-14). */
const CLIENT = {
  userId: 'user-1',
  lastName: 'Батбаяр',
  firstName: 'Түвшин',
  registerNumber: 'УБ12345678',
  birthDate: new Date('1998-04-17T00:00:00.000Z'),
  phone: '99112233',
  email: 'tuvshin@example.mn',
  address: 'УБ, ХУД',
  gender: 'MALE',
};

function buildHarness() {
  const prisma = {
    client: { findUnique: vi.fn().mockResolvedValue(CLIENT), update: vi.fn().mockResolvedValue(CLIENT) },
    case: {
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({}),
    },
    university: { findFirst: vi.fn().mockResolvedValue({ id: 'uni-1' }) },
  };

  const cases = { create: vi.fn().mockResolvedValue({ id: 'case-1' }) } as unknown as CasesService;
  const contracts = {
    activeTemplate: vi.fn().mockResolvedValue({ id: 'template-1' }),
    createForCase: vi.fn().mockResolvedValue({ id: 'contract-1' }),
  } as unknown as ContractsService;
  const pricing = { getActive: vi.fn().mockResolvedValue({ totalAmount: 5_000_000 }) } as unknown as PricingService;
  const clients = { findByUserId: vi.fn().mockResolvedValue(CLIENT) } as unknown as ClientsService;
  const documents = { progress: vi.fn().mockResolvedValue({}) } as unknown as CaseDocumentsService;

  const service = new MeService(prisma as unknown as PrismaService, clients, cases, contracts, pricing, documents);
  return { service, prisma, cases, contracts };
}

describe('MeService.startCase (1C-23)', () => {
  it('refuses an intake sent without the school it belongs to (1N-13)', async () => {
    // `CasesService` only checks the intake against a school when it is given
    // one, so this produced a case pointing at another school's calendar.
    const { service, cases } = buildHarness();

    await expect(
      service.startCase('user-1', { serviceType: ServiceType.BACHELOR, intakeId: 'intake-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(cases.create).not.toHaveBeenCalled();
  });

  it('opens the case and issues its electronic contract', async () => {
    const { service, cases, contracts, prisma } = buildHarness();
    // `caseDetail` at the end of the happy path is not what this asserts on.
    prisma.case.findFirst.mockResolvedValueOnce(null).mockResolvedValue(null);

    await service.startCase('user-1', { serviceType: ServiceType.BACHELOR, universityId: 'uni-1' }).catch(() => undefined);

    expect(cases.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', universityId: 'uni-1' }));
    expect(contracts.createForCase).toHaveBeenCalledWith({ caseId: 'case-1', type: ContractType.ELECTRONIC });
  });

  it('deletes the case when its contract cannot be issued (1N-15)', async () => {
    // Otherwise the client owns a contract-less case they cannot sign, and
    // every retry hits the "you already have one open" conflict.
    const { service, contracts, prisma } = buildHarness();
    vi.mocked(contracts.createForCase).mockRejectedValue(new Error('PDF renderer down'));

    await expect(
      service.startCase('user-1', { serviceType: ServiceType.BACHELOR, universityId: 'uni-1' }),
    ).rejects.toThrow('PDF renderer down');
    expect(prisma.case.delete).toHaveBeenCalledWith({ where: { id: 'case-1' } });
  });
});
