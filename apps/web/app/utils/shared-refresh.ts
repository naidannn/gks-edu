/**
 * What became of one attempt to renew the session.
 *
 * - `renewed` — the API rotated the token; `session` is the new pair.
 * - `superseded` — another tab rotated it first; adopt what it stored.
 * - `signed-out` — another tab signed out; nothing is stored any more.
 * - `rejected` — the API refused the token: the session really is over.
 * - `unavailable` — no verdict (offline, a deploy restarting the API, a 5xx).
 *   The tokens may well still be good, so they must be kept.
 */
export type RefreshOutcome<S> =
  | { kind: 'renewed'; session: S }
  | { kind: 'superseded'; refreshToken: string }
  | { kind: 'signed-out' }
  | { kind: 'rejected' }
  | { kind: 'unavailable' };

export interface SharedRefreshOptions<S> {
  /** The refresh token this tab holds in memory. */
  presented: string;
  /** The refresh token in shared storage right now — what every tab sees. */
  readStored: () => string | null;
  /** Trades a refresh token for a new session (`POST /auth/refresh`). */
  exchange: (refreshToken: string) => Promise<S>;
  /** Runs `fn` while no other tab holds the same lock. */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>;
}

/** Statuses with which the API says "this refresh token is no good". */
const REJECTED = new Set([400, 401, 403]);

function statusOf(error: unknown): number {
  const e = error as { statusCode?: number; response?: { status?: number } };
  return e?.statusCode ?? e?.response?.status ?? 0;
}

/**
 * Renews the session without racing the other tabs.
 *
 * The API rotates refresh tokens and treats a spent one coming back as theft
 * (1N-43): every session on the account is revoked. Tokens live in
 * `localStorage`, shared by every tab, but each tab keeps its own copy in
 * memory — so with two admin tabs open, the first to renew burned the token
 * the second still held, the second presented it, and both were signed out.
 * `singleFlight` only de-duplicates within one tab (0-24).
 *
 * So the renewal runs under a cross-tab lock, and inside it the stored token
 * is read again: if it is no longer the one this tab holds, someone else has
 * already renewed (or signed out), and this tab adopts that instead of
 * presenting a token that no longer exists.
 */
export async function refreshAcrossTabs<S>(
  options: SharedRefreshOptions<S>,
): Promise<RefreshOutcome<S>> {
  const { presented, readStored, exchange, withLock = (fn) => fn() } = options;

  return withLock(async (): Promise<RefreshOutcome<S>> => {
    const stored = readStored();
    if (stored === null) return { kind: 'signed-out' };
    if (stored !== presented) return { kind: 'superseded', refreshToken: stored };

    try {
      return { kind: 'renewed', session: await exchange(presented) };
    } catch (error) {
      return REJECTED.has(statusOf(error)) ? { kind: 'rejected' } : { kind: 'unavailable' };
    }
  });
}

/**
 * `navigator.locks` where the browser has it, otherwise no lock at all — the
 * re-read of the stored token still catches every tab that is not racing to
 * the millisecond.
 */
export function browserLock(name: string): <T>(fn: () => Promise<T>) => Promise<T> {
  return (fn) => {
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    return locks ? locks.request(name, fn) : fn();
  };
}

/** The `sub` claim of a JWT, without verifying it — only to spot an account switch. */
export function tokenSubject(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}
