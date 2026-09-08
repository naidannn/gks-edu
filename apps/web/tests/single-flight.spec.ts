import { describe, expect, it } from 'vitest';
import { singleFlight } from '../app/utils/single-flight';

/**
 * The regression this guards: the API rotates refresh tokens, and `/admin`
 * loads four things at once. Four simultaneous 401s used to mean four refresh
 * calls with the same token — one succeeded, three were rejected as replays,
 * and the last one to fail signed the user out of the session the first had
 * just renewed.
 */
describe('singleFlight', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('runs once for callers that overlap, and hands them all the same result', async () => {
    let runs = 0;
    const gate = deferred<string>();
    const call = singleFlight(() => {
      runs += 1;
      return gate.promise;
    });

    const all = Promise.all([call(), call(), call(), call()]);
    gate.resolve('session-1');

    expect(await all).toEqual(['session-1', 'session-1', 'session-1', 'session-1']);
    expect(runs).toBe(1);
  });

  it('starts a fresh run once the shared one has settled — it de-duplicates, it does not cache', async () => {
    let runs = 0;
    const call = singleFlight(() => Promise.resolve(++runs));

    expect(await call()).toBe(1);
    expect(await call()).toBe(2);
    expect(runs).toBe(2);
  });

  it('gives every waiting caller the same rejection', async () => {
    let runs = 0;
    const gate = deferred<never>();
    const call = singleFlight(() => {
      runs += 1;
      return gate.promise;
    });

    const first = call().catch((error: Error) => error.message);
    const second = call().catch((error: Error) => error.message);
    gate.reject(new Error('401'));

    expect(await first).toBe('401');
    expect(await second).toBe('401');
    expect(runs).toBe(1);
  });

  it('recovers after a failed run instead of wedging on it', async () => {
    let runs = 0;
    const call = singleFlight(() => {
      runs += 1;
      return runs === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
    });

    await expect(call()).rejects.toThrow('boom');
    await expect(call()).resolves.toBe('ok');
  });
});
