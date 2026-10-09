import { describe, expect, it, vi } from 'vitest';
import { refreshAcrossTabs, tokenSubject } from '../app/utils/shared-refresh';

/**
 * The regression this guards (0-24): with two admin tabs open, the first to
 * renew rotated the refresh token, the second presented the one it still held
 * in memory, the API took that for a stolen token and revoked every session —
 * and both tabs were signed out. A deploy restarting the API did the same,
 * because any failed refresh counted as a dead session.
 */
describe('refreshAcrossTabs', () => {
  function httpError(status: number) {
    return Object.assign(new Error(`HTTP ${status}`), { statusCode: status });
  }

  it('renews when this tab still holds the stored token', async () => {
    const exchange = vi.fn().mockResolvedValue({ refreshToken: 'R2' });
    const outcome = await refreshAcrossTabs({ presented: 'R1', readStored: () => 'R1', exchange });

    expect(outcome).toEqual({ kind: 'renewed', session: { refreshToken: 'R2' } });
    expect(exchange).toHaveBeenCalledWith('R1');
  });

  it('adopts another tab’s renewal instead of replaying the spent token', async () => {
    const exchange = vi.fn();
    const outcome = await refreshAcrossTabs({ presented: 'R1', readStored: () => 'R2', exchange });

    expect(outcome).toEqual({ kind: 'superseded', refreshToken: 'R2' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('follows another tab that signed out', async () => {
    const exchange = vi.fn();
    const outcome = await refreshAcrossTabs({ presented: 'R1', readStored: () => null, exchange });

    expect(outcome).toEqual({ kind: 'signed-out' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('reports a refused token as rejected', async () => {
    const exchange = vi.fn().mockRejectedValue(httpError(401));
    const outcome = await refreshAcrossTabs({ presented: 'R1', readStored: () => 'R1', exchange });

    expect(outcome).toEqual({ kind: 'rejected' });
  });

  it.each([502, 503, 500, 0])('keeps the session when the API answers %i', async (status) => {
    const exchange = vi.fn().mockRejectedValue(status ? httpError(status) : new TypeError('fetch failed'));
    const outcome = await refreshAcrossTabs({ presented: 'R1', readStored: () => 'R1', exchange });

    expect(outcome).toEqual({ kind: 'unavailable' });
  });

  it('serialises tabs: the second one through the lock adopts the first one’s token', async () => {
    // One shared `localStorage` and one lock, two tabs that both hold R1.
    let stored = 'R1';
    let tail = Promise.resolve();
    const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
      const run = tail.then(fn);
      tail = run.then(() => undefined, () => undefined);
      return run;
    };
    const exchange = vi.fn(async (token: string) => {
      expect(token).toBe('R1');
      stored = 'R2';
      return { refreshToken: 'R2' };
    });
    const tab = () =>
      refreshAcrossTabs({ presented: 'R1', readStored: () => stored, exchange, withLock });

    const [first, second] = await Promise.all([tab(), tab()]);

    expect(first.kind).toBe('renewed');
    expect(second).toEqual({ kind: 'superseded', refreshToken: 'R2' });
    expect(exchange).toHaveBeenCalledTimes(1);
  });
});

describe('tokenSubject', () => {
  it('reads `sub` from a JWT payload', () => {
    const payload = btoa(JSON.stringify({ sub: 'user-1', role: 'ADMIN' })).replace(/=+$/, '');
    expect(tokenSubject(`h.${payload}.s`)).toBe('user-1');
  });

  it('returns null for anything that is not a JWT', () => {
    expect(tokenSubject(null)).toBeNull();
    expect(tokenSubject('garbage')).toBeNull();
    expect(tokenSubject('a.%%%.c')).toBeNull();
  });
});
