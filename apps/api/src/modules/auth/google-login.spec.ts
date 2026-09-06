import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import { AuthService } from './auth.service.js';

const { verifyIdToken } = vi.hoisted(() => ({ verifyIdToken: vi.fn() }));

vi.mock('google-auth-library', () => ({
  // `new OAuth2Client(...)` — an arrow function would not be constructible.
  OAuth2Client: class {
    verifyIdToken = verifyIdToken;
  },
}));

const CLIENT_ID = 'client-1.apps.googleusercontent.com';
const ID_TOKEN = 'header.payload.signature';

function googlePayload(overrides: Record<string, unknown> = {}) {
  return { sub: 'google-sub-1', email: 'bat@gmail.com', email_verified: true, name: 'Бат', ...overrides };
}

/** Resolves `verifyIdToken` the way google-auth-library does — a ticket, not a payload. */
function respondWith(payload: Record<string, unknown> | undefined) {
  verifyIdToken.mockResolvedValue({ getPayload: () => payload });
}

function serviceStub(
  users: { byGoogleId?: unknown; byEmail?: unknown } = {},
  options: { clientId?: string } = {},
) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(users.byGoogleId ?? null),
      findFirst: vi.fn().mockResolvedValue(users.byEmail ?? null),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'user-1',
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      })),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        ...(users.byEmail as Record<string, unknown>),
        ...data,
      })),
    },
    refreshToken: { create: vi.fn() },
  };

  const jwt = {
    signAsync: vi.fn().mockResolvedValue('signed.jwt.token'),
    decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  const config = {
    get: vi.fn().mockReturnValue(options.clientId === undefined ? CLIENT_ID : options.clientId),
    getOrThrow: vi.fn().mockImplementation((key: string) => (key.endsWith('ExpiresIn') ? '15m' : 'secret')),
  };

  const notifications = { dispatch: vi.fn().mockResolvedValue(0) };

  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    notifications as unknown as NotificationsService,
    { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService,
  );

  return { service, prisma };
}

describe('AuthService.loginWithGoogle', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it('opens an account for an address nobody holds yet, with no password', async () => {
    respondWith(googlePayload());
    const { service, prisma } = serviceStub();

    const session = await service.loginWithGoogle(ID_TOKEN);

    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: ID_TOKEN, audience: CLIENT_ID });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'bat@gmail.com', googleId: 'google-sub-1', name: 'Бат' },
    });
    expect(prisma.user.create.mock.calls[0]![0].data).not.toHaveProperty('password');
    expect(session.accessToken).toBe('signed.jwt.token');
  });

  it('links the Google account to an existing row instead of forking a second one', async () => {
    respondWith(googlePayload());
    const existing = { id: 'user-9', email: 'Bat@Gmail.com', name: 'Бат', password: 'hash', isActive: true };
    const { service, prisma } = serviceStub({ byEmail: existing });

    await service.loginWithGoogle(ID_TOKEN);

    // Matched case-insensitively — staff type the address by hand.
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'bat@gmail.com', mode: 'insensitive' } },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-9' }, data: expect.objectContaining({ googleId: 'google-sub-1' }) }),
    );
  });

  it('settles an outstanding claim invitation (1B-17)', async () => {
    respondWith(googlePayload());
    const invited = {
      id: 'user-7',
      email: 'bat@gmail.com',
      name: null,
      password: null,
      isActive: true,
      claimTokenHash: 'sha256',
      claimedAt: null,
    };
    const { service, prisma } = serviceStub({ byEmail: invited });

    await service.loginWithGoogle(ID_TOKEN);

    const data = prisma.user.update.mock.calls[0]![0].data;
    expect(data.claimTokenHash).toBeNull();
    expect(data.claimedAt).toBeInstanceOf(Date);
    expect(data.name).toBe('Бат');
  });

  it('does not touch the database when Google has not verified the address', async () => {
    respondWith(googlePayload({ email_verified: false }));
    const { service, prisma } = serviceStub();

    await expect(service.loginWithGoogle(ID_TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects a token that does not verify', async () => {
    verifyIdToken.mockRejectedValue(new Error('Invalid token signature'));
    const { service } = serviceStub();

    await expect(service.loginWithGoogle(ID_TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('refuses a disabled account', async () => {
    respondWith(googlePayload());
    const { service } = serviceStub({ byGoogleId: { id: 'user-3', isActive: false } });

    await expect(service.loginWithGoogle(ID_TOKEN)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('answers 503 rather than 401 when GOOGLE_CLIENT_ID is unset', async () => {
    const { service } = serviceStub({}, { clientId: '' });

    await expect(service.loginWithGoogle(ID_TOKEN)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
