import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import { PasswordResetService } from './password-reset.service.js';

type UserRow = Record<string, unknown> | null;

function makeService(user: UserRow, options: { unique?: UserRow } = {}) {
  const prisma = {
    user: {
      findFirst: vi.fn().mockResolvedValue(user),
      findUnique: vi.fn().mockResolvedValue(options.unique ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    refreshToken: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    $transaction: vi.fn().mockResolvedValue([]),
  };

  const email = {
    send: vi.fn().mockResolvedValue(undefined),
    link: (path: string) => `https://gksedu.mn${path}`,
  };

  const service = new PasswordResetService(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
  );

  return { service, prisma, email };
}

describe('PasswordResetService.request', () => {
  it('says nothing and sends nothing for an unknown address', async () => {
    const { service, email, prisma } = makeService(null);

    await expect(service.request('nobody@example.mn')).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('issues a token and mails a link that carries it', async () => {
    const { service, email, prisma } = makeService({
      id: 'u1',
      email: 'bat@example.mn',
      name: 'Бат',
      password: 'hashed',
      googleId: null,
    });

    await service.request('Bat@Example.mn ');

    const written = prisma.user.update.mock.calls[0]?.[0] as {
      data: { passwordResetTokenHash: string; passwordResetExpiresAt: Date };
    };
    expect(written.data.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(written.data.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());

    const [to, message, tag] = email.send.mock.calls[0] as [string, { cta: { url: string } }, string];
    expect(to).toBe('bat@example.mn');
    expect(tag).toBe('password_reset');
    // The raw token lives only in the link — never in the database.
    expect(message.cta.url).toContain('/reset-password?token=');
    expect(message.cta.url).not.toContain(written.data.passwordResetTokenHash);
  });

  it('tells a Google-only account to use the sign-in button instead of minting a token', async () => {
    const { service, email, prisma } = makeService({
      id: 'u2',
      email: 'bat@gmail.com',
      name: 'Бат',
      password: null,
      googleId: 'google-sub-1',
    });

    await service.request('bat@gmail.com');

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(email.send.mock.calls[0]?.[2]).toBe('password_reset_google');
  });
});

describe('PasswordResetService.reset', () => {
  it('rejects an expired token', async () => {
    const { service } = makeService(null, {
      unique: {
        id: 'u1',
        email: 'bat@example.mn',
        name: 'Бат',
        isActive: true,
        passwordResetExpiresAt: new Date(Date.now() - 1000),
      },
    });

    await expect(service.reset('token', 'new-password')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown token with the same message', async () => {
    const { service } = makeService(null, { unique: null });
    await expect(service.reset('token', 'new-password')).rejects.toThrow(
      'Холбоос хүчингүй эсвэл хугацаа нь дууссан байна',
    );
  });

  it('sets the password, revokes every session, and confirms by email', async () => {
    const { service, prisma, email } = makeService(null, {
      unique: {
        id: 'u1',
        email: 'bat@example.mn',
        name: 'Бат',
        isActive: true,
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    await service.reset('token', 'new-password');

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(email.send.mock.calls[0]?.[2]).toBe('password_changed');
  });
});
