import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { MetaEventsService } from '../meta/meta-events.service.js';
import { AuthService } from './auth.service.js';

/**
 * Changing your own password while signed in. The interesting cases are the
 * two ends: an account that has a password must prove it, and an account that
 * has none has nothing to prove — so it is refused outright and sent to a
 * route that asks for the inbox instead (1N-43).
 */

/** Cheap rounds — these tests hash a handful of passwords, not a password file. */
const CURRENT = await hash('current-password', 4);

function serviceStub(user: Record<string, unknown> | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...user,
        ...data,
      })),
    },
    refreshToken: { create: vi.fn(), updateMany: vi.fn() },
  };

  const jwt = {
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

const ACTIVE = { id: 'user-1', isActive: true, role: 'CONSULTANT', claimedAt: null };

describe('AuthService.changePassword', () => {
  it('rejects a wrong current password', async () => {
    const { service, prisma } = serviceStub({ ...ACTIVE, password: CURRENT });
    await expect(
      service.changePassword('user-1', { currentPassword: 'not-the-one', newPassword: 'brand-new-pw' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects an omitted current password when the account has one', async () => {
    const { service } = serviceStub({ ...ACTIVE, password: CURRENT });
    await expect(service.changePassword('user-1', { newPassword: 'brand-new-pw' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects re-setting the same password', async () => {
    const { service } = serviceStub({ ...ACTIVE, password: CURRENT });
    await expect(
      service.changePassword('user-1', { currentPassword: 'current-password', newPassword: 'current-password' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('changes the password, kills every other session and hands back a fresh one', async () => {
    const { service, prisma } = serviceStub({ ...ACTIVE, password: CURRENT });
    const session = await service.changePassword('user-1', {
      currentPassword: 'current-password',
      newPassword: 'brand-new-pw',
    });

    const written = prisma.user.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(written.password).not.toBe(CURRENT);
    expect(written.claimTokenHash).toBeNull();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
    // Revoked first, issued after — the caller keeps working.
    expect(prisma.refreshToken.create).toHaveBeenCalled();
    expect(session.accessToken).toBe('signed.jwt.token');
  });

  /**
   * 1N-43 — with nothing to prove, a leaked fifteen-minute access token was
   * enough to mint a permanent credential, and the change revoked every session
   * so the real owner was logged out on the way in.
   */
  it('refuses a staff-created account with no password, and points at the emailed route', async () => {
    const { service, prisma } = serviceStub({ ...ACTIVE, password: null, googleId: null });
    await expect(service.changePassword('user-1', { newPassword: 'brand-new-pw' })).rejects.toThrow(
      /Нууц үгээ мартсан|урилга/,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a Google-only account the same way', async () => {
    const { service, prisma } = serviceStub({ ...ACTIVE, password: null, googleId: 'google-sub-1' });
    await expect(service.changePassword('user-1', { newPassword: 'brand-new-pw' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a deactivated account', async () => {
    const { service } = serviceStub({ ...ACTIVE, isActive: false, password: CURRENT });
    await expect(
      service.changePassword('user-1', { currentPassword: 'current-password', newPassword: 'brand-new-pw' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
