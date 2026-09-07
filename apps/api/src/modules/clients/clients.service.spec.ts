import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CaseChoiceTrack, ClientStatus, LeadSource, LeadStage, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { CasesService } from '../cases/cases.service.js';
import type { ContractsService } from '../contracts/contracts.service.js';
import type { AccountClaimService } from '../users/account-claim.service.js';
import { ClientsService } from './clients.service.js';
import type { CreateClientDto } from './dto/create-client.dto.js';

/** Someone comfortably over 18 on any plausible "today". */
const ADULT_BIRTH_DATE = '1998-04-17';

const SNU = '11111111-1111-1111-1111-111111111111';
const KOREA = '22222222-2222-2222-2222-222222222222';
const HANYANG = '33333333-3333-3333-3333-333333333333';

function adultDto(overrides: Partial<CreateClientDto> = {}): CreateClientDto {
  return {
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    birthDate: ADULT_BIRTH_DATE,
    registerNumber: 'УБ12345678',
    phone: '99112233',
    primaryServiceType: ServiceType.BACHELOR,
    ...overrides,
  } as CreateClientDto;
}

/** Birth date exactly `years` ago today, so the fixture never ages out of its case. */
function birthDateYearsAgo(years: number): string {
  const now = new Date();
  return new Date(now.getFullYear() - years, now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

/** The `User` row an address already belongs to, as `accountToAdopt` reads it. */
type AccountRow = {
  id: string;
  role: Role;
  password: string | null;
  googleId: string | null;
  client: { code: string } | null;
};

/** Someone who signed up on the site: their own password, no client record yet. */
function siteAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return { id: 'user-9', role: Role.USER, password: 'hashed', googleId: null, client: null, ...overrides };
}

function prismaStub(overrides: { registerTaken?: boolean; account?: AccountRow; lead?: unknown } = {}) {
  const created = { id: 'client-1', code: 'KH-2026-0001', userId: 'user-1' };

  const tx = {
    user: { create: vi.fn().mockResolvedValue({ id: 'user-1' }), update: vi.fn() },
    client: {
      // Echoes the account it was handed, so a test can tell a fresh `User`
      // row from one the client already had.
      create: vi.fn().mockImplementation(({ data }: { data: { userId: string } }) =>
        Promise.resolve({ ...created, userId: data.userId })),
      count: vi.fn().mockResolvedValue(0),
    },
    lead: { update: vi.fn() },
    leadActivity: { create: vi.fn() },
  };

  const prisma = {
    client: {
      findUnique: vi.fn().mockImplementation(({ where }: { where: { registerNumber?: string } }) =>
        where.registerNumber && overrides.registerTaken ? { code: 'KH-2026-0009' } : null),
      count: vi.fn().mockResolvedValue(0),
      create: tx.client.create,
    },
    user: {
      // `accountToAdopt` looks an address up; `invitePortal` looks the assigned
      // consultant up by id, and must not see the client's own account.
      findUnique: vi.fn().mockImplementation(({ where }: { where: { email?: string } }) =>
        where.email ? (overrides.account ?? null) : null),
      findFirst: vi.fn(),
    },
    lead: { findUnique: vi.fn().mockResolvedValue(overrides.lead ?? null) },
    $transaction: vi.fn().mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
  };

  return { prisma: prisma as unknown as PrismaService & typeof prisma, tx };
}

const casesStub = { createWithin: vi.fn().mockResolvedValue({ id: 'case-1' }) } as unknown as CasesService;
const claimsStub = { inviteQuietly: vi.fn().mockResolvedValue(undefined) } as unknown as AccountClaimService;
const contractsStub = {
  refreshUnsignedForUser: vi.fn().mockResolvedValue({ refreshed: 0, locked: 0 }),
} as unknown as ContractsService;

describe('ClientsService.create (1B-14)', () => {
  it('opens the account row and the first case in one transaction', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    // `findOne` re-reads the row; the write path is what this test is about.
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);

    await service.create(adultDto(), 'staff-1');

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Батбаяр Түвшин', phone: '99112233' }) }),
    );
    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ code: 'KH-2026-0001', userId: 'user-1', createdById: 'staff-1' }),
      }),
    );
    expect(casesStub.createWithin).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'user-1' }));
  });

  it('leaves the case unopened when the form says so', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (casesStub.createWithin as ReturnType<typeof vi.fn>).mockClear();

    await service.create(adultDto({ openCase: false }), 'staff-1');

    expect(tx.client.create).toHaveBeenCalled();
    expect(casesStub.createWithin).not.toHaveBeenCalled();
  });

  it('hands the whole school list to the case and keeps the first as the client`s own (§5.1)', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (casesStub.createWithin as ReturnType<typeof vi.fn>).mockClear();

    await service.create(
      adultDto({
        primaryServiceType: ServiceType.GKS_SCHOLARSHIP,
        universityChoices: [
          { universityId: SNU },
          { universityId: KOREA },
          { universityId: HANYANG, track: CaseChoiceTrack.REGULAR },
        ],
      }),
      'staff-1',
    );

    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetUniversityId: SNU }) }),
    );
    expect(casesStub.createWithin).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        universityChoices: [
          expect.objectContaining({ universityId: SNU, track: CaseChoiceTrack.SCHOLARSHIP, sortOrder: 0 }),
          expect.objectContaining({ universityId: KOREA, track: CaseChoiceTrack.SCHOLARSHIP, sortOrder: 1 }),
          expect.objectContaining({ universityId: HANYANG, track: CaseChoiceTrack.REGULAR, sortOrder: 2 }),
        ],
      }),
    );
  });

  it('refuses extra schools when no case is opened — they would have nowhere to live', async () => {
    const { prisma } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(
      service.create(
        adultDto({ openCase: false, universityChoices: [{ universityId: SNU }, { universityId: KOREA }] }),
        'staff-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses a minor without a guardian — they cannot sign the contract (§6.2)', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(service.create(adultDto({ birthDate: birthDateYearsAgo(16) }), 'staff-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('accepts a minor once the guardian block is complete', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);

    await service.create(
      adultDto({
        birthDate: birthDateYearsAgo(16),
        guardianLastName: 'Батбаяр',
        guardianFirstName: 'Оюун',
        guardianRegisterNumber: 'УБ87654321',
      }),
      'staff-1',
    );

    expect(tx.client.create).toHaveBeenCalled();
  });

  it('registers onto the account the client already opened on the site, and opens the case there (1B-20)', async () => {
    const { prisma, tx } = prismaStub({ account: siteAccount() });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (claimsStub.inviteQuietly as ReturnType<typeof vi.fn>).mockClear();
    (casesStub.createWithin as ReturnType<typeof vi.fn>).mockClear();

    const created = await service.create(adultDto({ email: 'Tuvshin@Example.mn' }), 'staff-1');

    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-9' },
      data: { name: 'Батбаяр Түвшин', phone: '99112233' },
    });
    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'user-9' }) }),
    );
    expect(casesStub.createWithin).toHaveBeenCalledWith(tx, expect.objectContaining({ userId: 'user-9' }));
    // They own the login already — a "set your password" invitation would be noise.
    expect(claimsStub.inviteQuietly).not.toHaveBeenCalled();
    expect(created.accountLinked).toBe(true);
  });

  it('still invites an account that has no login of its own', async () => {
    const { prisma } = prismaStub({ account: siteAccount({ password: null }) });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (claimsStub.inviteQuietly as ReturnType<typeof vi.fn>).mockClear();

    await service.create(adultDto({ email: 'tuvshin@example.mn' }), 'staff-1');

    expect(claimsStub.inviteQuietly).toHaveBeenCalledWith('user-9', expect.objectContaining({ kind: 'welcome' }));
  });

  it('refuses an address that is already a client, and names the record', async () => {
    const { prisma } = prismaStub({ account: siteAccount({ client: { code: 'KH-2026-0009' } }) });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(service.create(adultDto({ email: 'tuvshin@example.mn' }), 'staff-1')).rejects.toThrow(
      /KH-2026-0009/,
    );
  });

  it('refuses to turn a staff account into a client', async () => {
    const { prisma } = prismaStub({ account: siteAccount({ role: Role.CONSULTANT }) });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(service.create(adultDto({ email: 'bold@gksedu.mn' }), 'staff-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a register number that is already on file', async () => {
    const { prisma, tx } = prismaStub({ registerTaken: true });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(service.create(adultDto(), 'staff-1')).rejects.toThrow(ConflictException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });
});

describe('ClientsService.createFromLead (1B-10)', () => {
  const lead = {
    id: 'lead-1',
    client: null,
    lastName: 'Дорж',
    firstName: 'Сараа',
    phone: '88112233',
    email: 'saraa@example.mn',
    educationLevel: null,
    gpa: null,
    gpaScale: null,
    koreanLevel: 'TOPIK 3',
    englishLevel: null,
    interestedMajor: 'Компьютерийн ухаан',
    interestedUniversityIds: ['uni-1'],
    plannedIntakeId: null,
    interestedServices: [ServiceType.MASTER],
    source: LeadSource.WEBSITE,
    assignedToId: null,
    stage: LeadStage.CONSULTED,
  };

  it('copies the lead, links the two, and leaves the lead as WON history', async () => {
    const { prisma, tx } = prismaStub({ lead });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);

    await service.createFromLead(
      'lead-1',
      { birthDate: ADULT_BIRTH_DATE, registerNumber: 'УБ12345678' },
      'staff-1',
    );

    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leadId: 'lead-1',
          lastName: 'Дорж',
          koreanLevel: 'TOPIK 3',
          primaryServiceType: ServiceType.MASTER,
          targetUniversityId: 'uni-1',
          source: LeadSource.WEBSITE,
        }),
      }),
    );
    expect(tx.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: LeadStage.WON }) }),
    );
    expect(tx.leadActivity.create).toHaveBeenCalled();
  });

  it('will not convert the same lead twice', async () => {
    const { prisma, tx } = prismaStub({ lead: { ...lead, client: { id: 'client-9', code: 'KH-2026-0009' } } });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(
      service.createFromLead('lead-1', { birthDate: ADULT_BIRTH_DATE, registerNumber: 'УБ12345678' }, 'staff-1'),
    ).rejects.toThrow(ConflictException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('demands a service type when the lead never named one', async () => {
    const { prisma } = prismaStub({ lead: { ...lead, interestedServices: [] } });
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);

    await expect(
      service.createFromLead('lead-1', { birthDate: ADULT_BIRTH_DATE, registerNumber: 'УБ12345678' }, 'staff-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ClientsService status defaults', () => {
  it('registers a client as ACTIVE unless told otherwise', async () => {
    const { prisma, tx } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);

    await service.create(adultDto({ status: ClientStatus.INACTIVE }), 'staff-1');

    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ClientStatus.INACTIVE }) }),
    );
  });
});

describe('ClientsService portal invitation (1B-19)', () => {
  it('mails the welcome invitation as part of registering a client with an address', async () => {
    const { prisma } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (claimsStub.inviteQuietly as ReturnType<typeof vi.fn>).mockClear();

    await service.create(adultDto({ email: 'tuvshin@example.mn' }), 'staff-1');

    expect(claimsStub.inviteQuietly).toHaveBeenCalledWith('user-1', expect.objectContaining({ kind: 'welcome' }));
  });

  it('sends nothing when there is no address to send to', async () => {
    const { prisma } = prismaStub();
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (claimsStub.inviteQuietly as ReturnType<typeof vi.fn>).mockClear();

    await service.create(adultDto(), 'staff-1');

    expect(claimsStub.inviteQuietly).not.toHaveBeenCalled();
  });

  it('names the assigned consultant in the mail, so an expired link has someone to ring', async () => {
    const { prisma } = prismaStub();
    prisma.user.findFirst.mockResolvedValue({ id: 'staff-2' });
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string; email?: string } }) =>
      where.id === 'staff-2' ? { name: 'Зөвлөх Болд' } : null);
    const service = new ClientsService(prisma, casesStub, claimsStub, contractsStub);
    vi.spyOn(service, 'findOne').mockResolvedValue({ id: 'client-1' } as never);
    (claimsStub.inviteQuietly as ReturnType<typeof vi.fn>).mockClear();

    await service.create(adultDto({ email: 'tuvshin@example.mn', assignedConsultantId: 'staff-2' }), 'staff-1');

    expect(claimsStub.inviteQuietly).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ consultantName: 'Зөвлөх Болд' }),
    );
  });
});
