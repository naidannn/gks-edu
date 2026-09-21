import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../prisma/client.js';
import type { Prisma } from '../../prisma/client.js';
import { absorbLogin, findLoginToAbsorb } from './absorb-login.js';

/** The office's account for the client: owns the case, has never been logged into. */
const OWN = { id: 'office-user', password: null, googleId: null };

function siteAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'site-user',
    role: Role.USER,
    password: 'hashed',
    googleId: null,
    client: null,
    _count: { cases: 0, contracts: 0 },
    ...overrides,
  };
}

function dbReturning(row: unknown) {
  return { user: { findUnique: vi.fn().mockResolvedValue(row) } } as never;
}

describe('findLoginToAbsorb', () => {
  it('returns the self-registered login under the corrected address', async () => {
    await expect(findLoginToAbsorb(dbReturning(siteAccount()), 'Right@Gmail.com ', OWN)).resolves.toEqual({
      id: 'site-user',
      password: 'hashed',
      googleId: null,
    });
  });

  it('is a no-op when nobody holds the address, or the client already does', async () => {
    await expect(findLoginToAbsorb(dbReturning(null), 'a@b.mn', OWN)).resolves.toBeNull();
    await expect(findLoginToAbsorb(dbReturning(siteAccount({ id: OWN.id })), 'a@b.mn', OWN)).resolves.toBeNull();
  });

  it.each([
    ['another client', siteAccount({ client: { code: 'KH-2026-0003' } }), /KH-2026-0003/],
    ['staff', siteAccount({ role: Role.ADMIN }), /ажилтны/],
    ['an account with its own case', siteAccount({ _count: { cases: 1, contracts: 0 } }), /нэгтгэх/],
    ['an account with its own contract', siteAccount({ _count: { cases: 0, contracts: 1 } }), /нэгтгэх/],
  ])('refuses an address held by %s', async (_label, row, message) => {
    const found = findLoginToAbsorb(dbReturning(row), 'a@b.mn', OWN);
    await expect(found).rejects.toBeInstanceOf(ConflictException);
    await expect(findLoginToAbsorb(dbReturning(row), 'a@b.mn', OWN)).rejects.toThrow(message);
  });

  it('refuses when the client can already log in — two passwords, no way to pick', async () => {
    await expect(
      findLoginToAbsorb(dbReturning(siteAccount()), 'a@b.mn', { ...OWN, password: 'other-hash' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('absorbLogin', () => {
  function txStub() {
    const calls: string[] = [];
    const model = (name: string, rows: unknown[] = []) =>
      new Proxy(
        {},
        {
          get: (_target, method: string) =>
            vi.fn().mockImplementation(() => {
              calls.push(`${name}.${method}`);
              return Promise.resolve(method === 'findMany' ? rows : { count: 0 });
            }),
        },
      );
    const tx = {
      savedUniversity: model('savedUniversity', [{ universityId: 'uni-1' }]),
      notificationPreference: model('notificationPreference'),
      notification: model('notification'),
      lead: model('lead'),
      chatSession: model('chatSession'),
      conversation: model('conversation'),
      message: model('message'),
      leadActivity: model('leadActivity'),
      auditLog: model('auditLog'),
      refreshToken: model('refreshToken'),
      user: { delete: vi.fn(() => calls.push('user.delete')), update: vi.fn(() => calls.push('user.update')) },
    };
    return { tx, calls };
  }

  it('deletes the empty account before the kept one takes its address and login', async () => {
    const { tx, calls } = txStub();
    await absorbLogin(tx as unknown as Prisma.TransactionClient, OWN.id, { id: 'site-user', password: 'hashed', googleId: 'g-1' }, 'right@gmail.com');

    expect(calls.indexOf('user.delete')).toBeLessThan(calls.indexOf('user.update'));
    expect(calls).toContain('refreshToken.deleteMany');
    expect(calls).toContain('conversation.updateMany');
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'site-user' } });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: OWN.id },
      data: expect.objectContaining({
        email: 'right@gmail.com',
        password: 'hashed',
        googleId: 'g-1',
        claimTokenHash: null,
        claimTokenExpiresAt: null,
      }),
    });
  });
});
