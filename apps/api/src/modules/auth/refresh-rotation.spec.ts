import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { MetaEventsService } from '../meta/meta-events.service.js';
import { AuthService } from './auth.service.js';

/**
 * 1N-43 — refresh-token rotation with reuse detection.
 *
 * The rule under test is that the *revoke* is the claim: a token that cannot be
 * revoked was already spent, and a spent token presented again is treated as
 * theft rather than as a stale tab.
 */

const USER = { id: 'user-1', isActive: true, role: 'USER', email: 'bat@gks.mn', name: 'Бат' };
const TOKEN = 'refresh.jwt.token';

function serviceStub(options: {
  claimed?: number;
  spent?: { userId: string; revokedAt: Date | null } | null;
  stored?: Record<string, unknown> | null;
}) {
  const prisma = {
    refreshToken: {
      updateMany: vi.fn().mockResolvedValue({ count: options.claimed ?? 1 }),
      findUnique: vi
        .fn()
        // First read is the reuse probe, second is the row plus its user.
        .mockResolvedValueOnce(options.spent ?? null)
        .mockResolvedValue(
          options.stored === undefined ? { userId: USER.id, user: USER } : options.stored,
        ),
      create: vi.fn(),
    },
  };

  const jwt = {
    verifyAsync: vi.fn().mockResolvedValue({ sub: USER.id }),
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };
  const config = {
    getOrThrow: vi.fn().mockImplementation((key: string) => (key.endsWith('ExpiresIn') ? '15m' : 'secret')),
  };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    { dispatch: vi.fn() } as unknown as NotificationsService,
    { notify: vi.fn() } as unknown as SlackService,
    { track: vi.fn() } as unknown as MetaEventsService,
  );

  return { service, prisma };
}

describe('AuthService.refresh', () => {
  it('burns the presented token in the same statement that claims it', async () => {
    const { service, prisma } = serviceStub({});

    // The row plus its user, for the second read.
    prisma.refreshToken.findUnique.mockReset();
    prisma.refreshToken.findUnique.mockResolvedValue({ userId: USER.id, user: USER });

    const session = await service.refresh(TOKEN);

    const claim = prisma.refreshToken.updateMany.mock.calls[0]![0] as {
      where: { revokedAt: null; expiresAt: { gt: Date } };
      data: { revokedAt: Date };
    };
    // Narrowed to the un-revoked, unexpired row: two concurrent refreshes of
    // the same token cannot both match it.
    expect(claim.where.revokedAt).toBeNull();
    expect(claim.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(claim.data.revokedAt).toBeInstanceOf(Date);
    expect(session.accessToken).toBe('signed.jwt.token');
  });

  it('revokes every session when an already-revoked token comes back', async () => {
    const { service, prisma } = serviceStub({
      claimed: 0,
      spent: { userId: USER.id, revokedAt: new Date('2026-09-10T00:00:00Z') },
    });

    await expect(service.refresh(TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);

    // The family goes: whoever else is holding a copy loses it too.
    expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { userId: USER.id, revokedAt: null } }),
    );
  });

  it('leaves the other sessions alone when the token has merely expired', async () => {
    const { service, prisma } = serviceStub({
      claimed: 0,
      spent: { userId: USER.id, revokedAt: null },
    });

    await expect(service.refresh(TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
    // Only the failed claim ran — time passing is not theft.
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
  });

  it('refuses a token that belongs to a deactivated account', async () => {
    const { service, prisma } = serviceStub({});
    prisma.refreshToken.findUnique.mockReset();
    prisma.refreshToken.findUnique.mockResolvedValue({
      userId: USER.id,
      user: { ...USER, isActive: false },
    });

    await expect(service.refresh(TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refuses a token whose subject is not the row it hashes to', async () => {
    const { service, prisma } = serviceStub({});
    prisma.refreshToken.findUnique.mockReset();
    prisma.refreshToken.findUnique.mockResolvedValue({ userId: 'someone-else', user: USER });

    await expect(service.refresh(TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
