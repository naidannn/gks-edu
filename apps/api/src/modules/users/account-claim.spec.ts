import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import { AccountClaimService, CLAIM_TTL_MS } from './account-claim.service.js';

type UserRow = Record<string, unknown> | null;

function makeService(user: UserRow) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({ id: 'u1', email: 'bat@example.mn' }),
    },
  };

  const email = {
    send: vi.fn().mockResolvedValue(undefined),
    link: (path: string) => `https://gksedu.mn${path}`,
  };

  const service = new AccountClaimService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
  );

  return { service, prisma, email };
}

const FRESH = { id: 'u1', email: 'bat@example.mn', name: 'Бат', password: null, googleId: null };

describe('AccountClaimService.invite (1B-17, 1B-19)', () => {
  it('sends the welcome copy for a freshly registered client, valid for seven days', async () => {
    const { service, prisma, email } = makeService(FRESH);

    const { expiresAt } = await service.invite('u1', { kind: 'welcome', consultantName: 'Зөвлөх Болд' });

    const written = prisma.user.update.mock.calls[0]?.[0] as { data: { claimTokenHash: string } };
    expect(written.data.claimTokenHash).toMatch(/^[0-9a-f]{64}$/);
    // Seven days, give or take the milliseconds this test took to get here.
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(CLAIM_TTL_MS - 5_000);

    const [to, message, tag] = email.send.mock.calls[0] as [string, { subject: string; body: string; cta: { url: string } }, string];
    expect(to).toBe('bat@example.mn');
    expect(tag).toBe('account_welcome');
    expect(message.subject).toContain('тавтай морил');
    // The raw token lives only in the link — never in the database.
    expect(message.cta.url).toContain('https://gksedu.mn/claim?token=');
    expect(message.cta.url).not.toContain(written.data.claimTokenHash);
    // An expired link has to lead somewhere: the consultant, by name.
    expect(message.body).toContain('Зөвлөх Болд');
  });

  it('sends the plainer invitation when staff re-send it', async () => {
    const { service, email } = makeService(FRESH);

    await service.invite('u1', { kind: 'invite' });

    expect(email.send.mock.calls[0]?.[2]).toBe('account_claim');
  });

  it('refuses an account that already has a password', async () => {
    const { service, email } = makeService({ ...FRESH, password: 'hashed' });

    await expect(service.invite('u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('refuses a Google account — there is no password for them to set', async () => {
    const { service, email } = makeService({ ...FRESH, googleId: 'google-sub-1' });

    await expect(service.invite('u1')).rejects.toThrow('Google');
    expect(email.send).not.toHaveBeenCalled();
  });

  it('refuses when there is no address, rather than minting a token nobody receives', async () => {
    const { service, prisma } = makeService({ ...FRESH, email: null });

    await expect(service.invite('u1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('swallows a failed send so registering a client survives a mail outage', async () => {
    const { service, email } = makeService(FRESH);
    email.send.mockRejectedValue(new Error('Resend 500'));

    await expect(service.inviteQuietly('u1', { kind: 'welcome' })).resolves.toBeUndefined();
  });
});

describe('AccountClaimService.claim', () => {
  it('rejects an expired invitation with the same message as an unknown one', async () => {
    const expired = makeService({ id: 'u1', claimTokenExpiresAt: new Date(Date.now() - 1000), password: null });
    const unknown = makeService(null);

    const message = 'Урилгын холбоос хүчингүй эсвэл хугацаа нь дууссан байна';
    await expect(expired.service.claim('token', 'new-password')).rejects.toThrow(message);
    await expect(unknown.service.claim('token', 'new-password')).rejects.toThrow(message);
  });

  it('sets the password and clears the token', async () => {
    const { service, prisma } = makeService({
      id: 'u1',
      email: 'bat@example.mn',
      claimTokenExpiresAt: new Date(Date.now() + 60_000),
      password: null,
    });

    await service.claim('token', 'new-password');

    const written = prisma.user.update.mock.calls[0]?.[0] as {
      data: { password: string; claimTokenHash: null; claimedAt: Date };
    };
    expect(written.data.password).not.toBe('new-password');
    expect(written.data.claimTokenHash).toBeNull();
    expect(written.data.claimedAt).toBeInstanceOf(Date);
  });
});
