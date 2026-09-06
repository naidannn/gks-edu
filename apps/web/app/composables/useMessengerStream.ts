import type { MessengerStreamEvent, UnreadSummary } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * The live connection behind the messenger (1K).
 *
 * `EventSource` cannot carry an `Authorization` header, and this API has no
 * cookie session — so the stream is read with `fetch` and a stream reader
 * instead. That costs a hand-written frame parser and buys the route staying
 * behind the same guard as every other endpoint, with no token in a URL that
 * would end up in nginx's access log.
 *
 * One connection per browser tab, shared by every screen: the thread pane, the
 * list, and the unread badge in the nav all subscribe to the same events.
 */

type Listener = (event: MessengerStreamEvent) => void;

/** Backoff between reconnection attempts — quick at first, then out of the way. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * The server sends a heartbeat every 25s. If nothing at all arrives inside
 * this window the connection is dead even though the socket has not said so —
 * a restarted server, a dropped Wi-Fi link and a laptop coming out of sleep
 * all leave `reader.read()` hanging indefinitely, and a chat that has silently
 * stopped receiving is worse than one that is visibly reconnecting.
 */
const SILENCE_TIMEOUT_MS = 45_000;
const WATCHDOG_INTERVAL_MS = 10_000;

export function useMessengerStream() {
  const auth = useAuthStore();
  const config = useRuntimeConfig();

  const connected = useState<boolean>('messenger:connected', () => false);
  const unread = useState<UnreadSummary>('messenger:unread', () => ({ threads: 0, messages: 0 }));

  // Listeners and the connection itself live outside Vue's reactivity: they
  // are per-tab machinery, not state anything renders.
  const listeners = useState<Set<Listener>>('messenger:listeners', () => new Set());
  const runtime = useState<{
    abort: AbortController | null;
    attempts: number;
    stopped: boolean;
    /** When the last byte arrived, heartbeats included — the watchdog's input. */
    lastEventAt: number;
    watchdog: ReturnType<typeof setInterval> | null;
  }>('messenger:runtime', () => ({
    abort: null,
    attempts: 0,
    stopped: true,
    lastEventAt: 0,
    watchdog: null,
  }));

  function on(listener: Listener): () => void {
    listeners.value.add(listener);
    return () => listeners.value.delete(listener);
  }

  function dispatch(event: MessengerStreamEvent): void {
    for (const listener of listeners.value) {
      try {
        listener(event);
      } catch {
        // One misbehaving screen must not take the connection down.
      }
    }
  }

  async function refreshUnread(): Promise<void> {
    try {
      unread.value = await useApi().get<UnreadSummary>('/messenger/unread');
    } catch {
      // Keep the last known count rather than blanking the badge.
    }
  }

  /**
   * Reads one connection to completion. Returns when the stream ends for any
   * reason; the caller decides whether to try again.
   */
  async function readStream(): Promise<void> {
    const abort = new AbortController();
    runtime.value.abort = abort;
    runtime.value.lastEventAt = Date.now();

    const response = await fetch(`${config.public.apiBase}/messenger/stream`, {
      headers: {
        Accept: 'text/event-stream',
        ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
      },
      signal: abort.signal,
    });

    if (response.status === 401) {
      // An expired access token, not a dead stream: refresh and let the
      // caller reconnect immediately rather than backing off.
      const refreshed = await auth.refresh();
      if (!refreshed) runtime.value.stopped = true;
      return;
    }
    if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

    connected.value = true;
    runtime.value.attempts = 0;
    await refreshUnread();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      // Any traffic at all counts, heartbeat frames included: what the
      // watchdog watches for is silence, not for messages.
      runtime.value.lastEventAt = Date.now();
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line. Anything after the last one
      // is a partial frame and stays in the buffer for the next chunk.
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        handleFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
  }

  function handleFrame(frame: string): void {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;

    try {
      const event = JSON.parse(data) as MessengerStreamEvent;
      if (event.type === 'ping') return;
      dispatch(event);
    } catch {
      // A frame we cannot parse is not worth dropping the connection over.
    }
  }

  /** Idempotent: calling it from three screens still opens one connection. */
  function connect(): void {
    if (import.meta.server || !auth.isAuthenticated) return;
    if (!runtime.value.stopped) return;

    runtime.value.stopped = false;

    // One watchdog for the life of the loop: it cuts a connection that has
    // gone quiet so the reconnect below can take over.
    if (runtime.value.watchdog) clearInterval(runtime.value.watchdog);
    runtime.value.watchdog = setInterval(() => {
      if (runtime.value.stopped || !runtime.value.abort) return;
      if (Date.now() - runtime.value.lastEventAt < SILENCE_TIMEOUT_MS) return;
      runtime.value.abort.abort();
    }, WATCHDOG_INTERVAL_MS);

    void (async () => {
      while (!runtime.value.stopped) {
        try {
          await readStream();
        } catch {
          // Network drop, server restart, laptop lid — all the same from here.
        }

        connected.value = false;
        if (runtime.value.stopped) break;
        // Whatever happened while the connection was down was never delivered,
        // so listeners are told to reload rather than left with a thread that
        // quietly stops at the last message they happened to see.
        dispatch({ type: 'reconnect' });

        const wait = RETRY_MS[Math.min(runtime.value.attempts, RETRY_MS.length - 1)] ?? 30_000;
        runtime.value.attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    })();
  }

  function disconnect(): void {
    runtime.value.stopped = true;
    if (runtime.value.watchdog) clearInterval(runtime.value.watchdog);
    runtime.value.watchdog = null;
    runtime.value.abort?.abort();
    runtime.value.abort = null;
    connected.value = false;
  }

  return { connected, unread, on, connect, disconnect, refreshUnread };
}
