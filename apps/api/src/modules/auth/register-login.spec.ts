import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { MetaEventsService } from '../meta/meta-events.service.js';
import type { AccountClaimService } from '../users/account-claim.service.js';
import { AuthService } from './auth.service.js';

/**
 * The first visit of a person the office registered before they ever opened
 * the site. Their account exists — it holds the case and the contract — but it
 * has no password, so both doors used to answer with something untrue: the
 * sign-up form said "already registered", the login form said "wrong
 * password", and the person went back and forth between the two.
 */

const PASSWORD = 'correct-password';
const HASHED = await hash(PASSWORD, 4);

function serviceStub(user: Record<string, unknown> | null) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      create: vi.fn(),
    },
    refreshToken: { create: vi.fn() },
  };
  const jwt = {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };
  const config = {
    getOrThrow: vi.fn().mockImplementation((key: string) => (key.endsWith('ExpiresIn') ? '15m' : 'secret')),
  };
  const claims = { inviteQuietly: vi.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    { dispatch: vi.fn() } as unknown as NotificationsService,
    { notify: vi.fn() } as unknown as SlackService,
    { track: vi.fn() } as unknown as MetaEventsService,
    claims as unknown as AccountClaimService,
  );

  return { service, prisma, claims };
}

/** A client the office registered: an address, no credentials of their own. */
const OFFICE_ROW = { id: 'user-1', email: 'bat@example.mn', password: null, googleId: null, role: 'USER', isActive: true };

describe('AuthService.register on an address the office already holds', () => {
  it('re-sends the activation link instead of taking the typed password', async () => {
    const { service, prisma, claims } = serviceStub(OFFICE_ROW);

    await expect(service.register({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(
      /идэвхжүүлэх холбоосыг/,
    );
    expect(claims.inviteQuietly).toHaveBeenCalledWith('user-1', { kind: 'invite' });
    // Typing a password here proves nothing about the inbox — it is never stored.
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('sends nothing for an account somebody already owns', async () => {
    const { service, claims } = serviceStub({ ...OFFICE_ROW, password: HASHED });

    await expect(service.register({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(
      ConflictException,
    );
    expect(claims.inviteQuietly).not.toHaveBeenCalled();
  });

  it('points a Google-only account at the Google button', async () => {
    const { service, claims } = serviceStub({ ...OFFICE_ROW, googleId: 'google-sub-1' });

    await expect(service.register({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(/Google/);
    expect(claims.inviteQuietly).not.toHaveBeenCalled();
  });

  it('never mails a staff row that has not been claimed', async () => {
    const { service, claims } = serviceStub({ ...OFFICE_ROW, role: 'CONSULTANT' });

    await expect(service.register({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(
      ConflictException,
    );
    expect(claims.inviteQuietly).not.toHaveBeenCalled();
  });
});

describe('AuthService.login on an account with no password', () => {
  it('says how to set one rather than "wrong password"', async () => {
    const { service } = serviceStub(OFFICE_ROW);

    await expect(service.login({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(
      /нууц үг тохируулаагүй/,
    );
  });

  it('sends a Google-only account to the Google button', async () => {
    const { service } = serviceStub({ ...OFFICE_ROW, googleId: 'google-sub-1' });

    await expect(service.login({ email: 'bat@example.mn', password: 'anything-at-all' })).rejects.toThrow(/Google/);
  });

  it('keeps the plain answer for a wrong password and for an unknown address', async () => {
    for (const user of [{ ...OFFICE_ROW, password: HASHED }, null]) {
      const { service } = serviceStub(user);
      await expect(service.login({ email: 'bat@example.mn', password: 'wrong-password' })).rejects.toThrow(
        new UnauthorizedException('И-мэйл эсвэл нууц үг буруу байна'),
      );
    }
  });

  it('still signs in with the right password', async () => {
    const { service } = serviceStub({ ...OFFICE_ROW, password: HASHED });

    await expect(service.login({ email: 'bat@example.mn', password: PASSWORD })).resolves.toMatchObject({
      accessToken: 'signed.jwt.token',
    });
  });
});
