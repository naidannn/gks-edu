import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { OtpService } from '../../otp/otp.service.js';
import { ContractStatus, ContractType, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import { ContractsService } from './contracts.service.js';

const USER: AuthenticatedUser = { id: 'user-1', email: 'temuulen@example.mn', role: Role.USER };

function contractRow(overrides: { acceptedAt?: Date | null; status?: ContractStatus } = {}) {
  return {
    id: 'contract-1',
    caseId: 'case-1',
    userId: USER.id,
    number: 'СГ/26/001',
    type: ContractType.ELECTRONIC,
    status: overrides.status ?? ContractStatus.SENT,
    totalAmountSnapshot: 5_000_000,
    acceptedAt: overrides.acceptedAt ?? null,
  };
}

function subject(options: { row?: ReturnType<typeof contractRow>; accountEmail?: string | null } = {}) {
  const row = options.row ?? contractRow();
  const update = vi.fn().mockResolvedValue({});
  const prisma = {
    contract: { findUnique: vi.fn().mockResolvedValue(row), update },
    user: {
      findUnique: vi.fn().mockResolvedValue(
        options.accountEmail === undefined
          ? { email: 'temuulen@example.mn', name: 'Батбаярын Тэмүүлэн' }
          : { email: options.accountEmail, name: 'Батбаярын Тэмүүлэн' },
      ),
    },
    case: { findUnique: vi.fn().mockResolvedValue({ serviceType: ServiceType.GKS_SCHOLARSHIP }) },
  } as unknown as PrismaService;

  const send = vi.fn().mockResolvedValue(undefined);
  const issue = vi.fn().mockResolvedValue('408217');
  const stub = null as never;

  const service = new ContractsService(
    prisma,
    stub,
    stub,
    stub,
    stub,
    { issue } as unknown as OtpService,
    { send } as unknown as EmailService,
    stub,
    stub,
  );

  return { service, send, issue, update };
}

describe('ContractsService.accept — the code goes to the account (1C-33)', () => {
  it('mails the issued code to the address on the account, not one supplied by the caller', async () => {
    const { service, send, issue } = subject();

    const result = await service.accept('contract-1', USER);

    expect(issue).toHaveBeenCalledWith('contract-1');
    expect(result).toEqual({ sent: true, email: 'temuulen@example.mn' });

    const [to, message, tag] = send.mock.calls[0]!;
    expect(to).toBe('temuulen@example.mn');
    expect(tag).toBe('contract_sign_otp');
    // The digits belong in the panel, never in the prose or the inbox preview.
    expect(message.code.value).toBe('408217');
    expect(message.body).not.toContain('408217');
    expect(message.preheader).not.toContain('408217');
    // Enough of the contract to tell whether this is what they just agreed to.
    expect(message.body).toContain('СГ/26/001');
    expect(message.body).toContain('5,000,000');
  });

  it('records the moment of agreement once — a resent code is not a second agreement', async () => {
    const first = subject();
    await first.service.accept('contract-1', USER);
    expect(first.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { acceptedAt: expect.any(Date) } }),
    );

    const agreedAlready = subject({ row: contractRow({ acceptedAt: new Date(2026, 8, 1) }) });
    await agreedAlready.service.accept('contract-1', USER);
    expect(agreedAlready.send).toHaveBeenCalledTimes(1);
    expect(agreedAlready.update).not.toHaveBeenCalled();
  });

  it('leaves the contract un-accepted when the mail cannot be sent', async () => {
    const { service, send, update } = subject();
    send.mockRejectedValue(new Error('Resend 502'));

    await expect(service.accept('contract-1', USER)).rejects.toThrow('Resend 502');
    // Otherwise the client waits on the "enter the code" step for a code that
    // never left the building.
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses when the account has no address of its own (1B-14)', async () => {
    const { service, send } = subject({ accountEmail: null });

    await expect(service.accept('contract-1', USER)).rejects.toBeInstanceOf(BadRequestException);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses a contract that belongs to somebody else', async () => {
    const { service, send } = subject();

    await expect(service.accept('contract-1', { ...USER, id: 'user-2' })).rejects.toThrow(
      'Энэ гэрээ танд харьяалагдахгүй байна',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
