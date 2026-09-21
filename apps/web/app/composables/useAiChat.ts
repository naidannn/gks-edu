import type {
  AiChatCard,
  AiChatChannel,
  AiChatMessageItem,
  AiChatTranscript,
  AiFeedbackReason,
  AiFeedbackValue,
  AiSessionStart,
  AiSource,
  AiStreamEvent,
} from '@gks/shared';
import { attributionPayload } from '~/utils/attribution';
import { createSseParser } from '~/utils/sse';
import { useAuthStore } from '~/stores/auth';

/**
 * The conversation with the assistant (2C-01).
 *
 * One conversation per browser tab, shared by the widget and the `/chat` page —
 * open the full page from the widget and the thread is the same thread, because
 * both read the same `useState`.
 *
 * The stream is read from a **POST**: the question does not belong in a URL,
 * where nginx would write it to an access log. That rules out `EventSource`, so
 * the frames are parsed by hand with `~/utils/sse` — the same parser the
 * messenger uses (1K), which is the whole reason it was pulled out of it.
 *
 * Three things here are less obvious than they look:
 *
 * - **The session is created lazily**, on the first message rather than on
 *   mount. A visitor who never opens the widget should not cost a row.
 * - **The token is the only proof a guest has.** It lives in `localStorage`, so
 *   a reload keeps the thread; it proves one conversation and nothing else.
 * - **Silence is a failure.** A model call that hangs leaves `reader.read()`
 *   pending forever, and a widget that is quietly waiting is worse than one
 *   that has visibly given up — hence the watchdog.
 */

/** The server heartbeats every 25s; 45s of nothing at all means it is gone. */
const SILENCE_TIMEOUT_MS = 45_000;

const TOKEN_KEY = 'gks:ai:token';
const SESSION_KEY = 'gks:ai:session';
const ANON_KEY = 'gks:ai:anon';

/** A message on screen, which is a stored one plus whatever is still arriving. */
export interface AiChatBubble {
  /** `null` while the answer is still streaming — it has no stored id yet. */
  id: string | null;
  role: 'USER' | 'ASSISTANT';
  content: string;
  sources: AiSource[];
  cards: AiChatCard[];
  grounded: boolean;
  pending: boolean;
  feedback: { value: AiFeedbackValue; reason: AiFeedbackReason | null } | null;
}

/** What the assistant is doing right now — the widget's status line. */
export interface AiChatActivity {
  name: string;
  label: string;
}

export function useAiChat() {
  const config = useRuntimeConfig();
  const auth = useAuthStore();
  const api = useApi();

  const messages = useState<AiChatBubble[]>('ai:messages', () => []);
  const sending = useState<boolean>('ai:sending', () => false);
  const activity = useState<AiChatActivity | null>('ai:activity', () => null);
  const greeting = useState<string | null>('ai:greeting', () => null);
  /** Set when the assistant cannot answer; carries where to send the visitor. */
  const offline = useState<{ message: string; fallback: 'messenger' | 'consultation' } | null>(
    'ai:offline',
    () => null,
  );
  const sessionId = useState<string | null>('ai:sessionId', () => null);
  const loadedSessionId = useState<string | null>('ai:loaded', () => null);
  /** Which shell this conversation started in — set by whichever widget mounts. */
  const channel = useState<AiChatChannel>('ai:channel', () => 'WEB_WIDGET');

  // ─── the guest's own identifiers ────────────────────────────────────────────

  function stored(key: string): string | null {
    if (import.meta.server) return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Safari in private mode throws on every access. A visitor who cannot
      // store a token gets a conversation that does not survive a reload,
      // which is a degraded chat rather than a broken one.
      return null;
    }
  }

  function remember(key: string, value: string): void {
    if (import.meta.server) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // See above.
    }
  }

  function forget(): void {
    if (import.meta.server) return;
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // See above.
    }
  }

  function anonymousId(): string {
    const existing = stored(ANON_KEY);
    if (existing) return existing;

    // Not `crypto.randomUUID()` — it is missing on http:// origins in older
    // Safari, which is exactly where a fallback is least likely to be noticed.
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    remember(ANON_KEY, fresh);
    return fresh;
  }

  /** The header that proves a guest owns this conversation. */
  function chatHeaders(): Record<string, string> {
    const token = stored(TOKEN_KEY);
    return {
      ...(token ? { 'X-Chat-Token': token } : {}),
      ...(auth.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {}),
    };
  }

  // ─── session lifecycle ──────────────────────────────────────────────────────

  /** Is there an assistant at all? Answered before the widget draws itself. */
  async function status(): Promise<boolean> {
    try {
      const result = await api.get<{ enabled: boolean; greeting: string | null }>('/ai/chat/status');
      greeting.value = result.greeting;
      return result.enabled;
    } catch {
      // The API being unreachable is not the same as the assistant being off,
      // but it looks identical to a visitor — and offering a chat that cannot
      // connect is the worse of the two mistakes.
      return false;
    }
  }

  /**
   * The session to send this message in, creating one if there is none.
   *
   * A stored token that the server no longer honours (expired, or a session
   * deleted) is dropped and replaced rather than retried — the visitor should
   * not have to clear their own storage to be able to ask a question.
   */
  async function ensureSession(): Promise<string> {
    const existing = sessionId.value ?? stored(SESSION_KEY);
    if (existing && stored(TOKEN_KEY)) {
      sessionId.value = existing;
      return existing;
    }

    const started = await api.post<AiSessionStart>('/ai/chat/sessions', {
      channel: channel.value,
      anonymousId: anonymousId(),
      landingPage: window.location.pathname,
      // Same shape as the lead form's `utm`: a lead the assistant captures
      // copies this block onto the lead as-is.
      utm: attributionPayload(),
    });

    remember(TOKEN_KEY, started.token);
    remember(SESSION_KEY, started.sessionId);
    sessionId.value = started.sessionId;
    greeting.value = started.greeting;
    loadedSessionId.value = started.sessionId;

    return started.sessionId;
  }

  /**
   * Loads the thread back after a reload, once per session.
   *
   * Signing in claims the conversation on the way through: the server attaches
   * a guest session to the account of whoever presents a bearer token with it
   * (`ChatSessionService.authorise`), so a visitor who asked three questions and
   * then registered keeps all three — and the consultant who picks the thread up
   * can see who is asking.
   */
  async function restore(): Promise<void> {
    const existing = stored(SESSION_KEY);
    if (!existing || !stored(TOKEN_KEY)) return;
    if (loadedSessionId.value === existing && !auth.isAuthenticated) return;

    try {
      const transcript = await api.get<AiChatTranscript>(`/ai/chat/sessions/${existing}`, {
        headers: chatHeaders(),
      });

      if (transcript.status === 'CLOSED') {
        forget();
        return;
      }

      sessionId.value = transcript.sessionId;
      loadedSessionId.value = transcript.sessionId;
      messages.value = transcript.messages.map(toBubble);
    } catch {
      // A token we cannot use is worse than none: it would fail every turn.
      forget();
      sessionId.value = null;
    }
  }

  function toBubble(item: AiChatMessageItem): AiChatBubble {
    return {
      id: item.id,
      role: item.role,
      content: item.content,
      sources: item.sources ?? [],
      cards: item.cards ?? [],
      grounded: item.grounded,
      pending: false,
      feedback: item.feedback,
    };
  }

  // ─── one turn ───────────────────────────────────────────────────────────────

  /**
   * Sends a question and streams the answer into the last bubble.
   *
   * The answer bubble is pushed empty and filled token by token, so the visitor
   * sees the assistant thinking rather than a spinner that resolves into a wall
   * of text. Cards and citations arrive as their own frames and attach to the
   * same bubble — the figures in a card came from the database, not from the
   * model, so they are correct even when the prose around them is clumsy.
   */
  async function send(text: string): Promise<void> {
    const question = text.trim();
    if (!question || sending.value) return;

    offline.value = null;
    sending.value = true;
    messages.value = [
      ...messages.value,
      { id: null, role: 'USER', content: question, sources: [], cards: [], grounded: true, pending: false, feedback: null },
      { id: null, role: 'ASSISTANT', content: '', sources: [], cards: [], grounded: true, pending: true, feedback: null },
    ];

    // The answer bubble is the last one — until it is dropped for being empty,
    // after which the last one is the question and must not be touched. Every
    // helper below therefore checks the role rather than trusting the position.
    const answer = (): AiChatBubble | null => {
      const last = messages.value[messages.value.length - 1];
      return last?.role === 'ASSISTANT' ? last : null;
    };

    const patch = (changes: Partial<AiChatBubble>): void => {
      const current = answer();
      if (!current) return;

      const next = [...messages.value];
      next[next.length - 1] = { ...current, ...changes };
      messages.value = next;
    };

    /** An apology under a blank bubble reads as two failures rather than one. */
    const dropIfEmpty = (): void => {
      if (answer()?.content === '') messages.value = messages.value.slice(0, -1);
    };

    const abort = new AbortController();
    let lastFrameAt = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastFrameAt > SILENCE_TIMEOUT_MS) abort.abort();
    }, 5_000);

    try {
      const id = await ensureSession();
      const response = await fetch(`${config.public.apiBase}/ai/chat/sessions/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...chatHeaders() },
        body: JSON.stringify({ message: question }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) throw new Error(`chat ${response.status}`);

      const parser = createSseParser();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        lastFrameAt = Date.now();
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          apply(JSON.parse(frame.data) as AiStreamEvent, patch, answer, dropIfEmpty);
        }
      }

      const tail = parser.flush();
      if (tail) apply(JSON.parse(tail.data) as AiStreamEvent, patch, answer, dropIfEmpty);

      // A stream that ended without a `done` frame — a dropped connection, a
      // restarted API — leaves the bubble mid-sentence. Say so, rather than
      // presenting a truncated answer as a finished one.
      if (answer()?.pending) {
        patch({ pending: false });
        if (!answer()?.content) {
          dropIfEmpty();
          offline.value = {
            message: 'Хариулт тасарлаа. Дахин оролдоно уу, эсвэл зөвлөхтэй холбогдоно уу.',
            fallback: 'messenger',
          };
        }
      }
    } catch {
      patch({ pending: false });
      dropIfEmpty();
      offline.value = {
        message: 'Холболт тасарлаа. Дахин оролдоно уу, эсвэл зөвлөхтэй шууд холбогдоно уу.',
        fallback: 'messenger',
      };
    } finally {
      clearInterval(watchdog);
      sending.value = false;
      activity.value = null;
    }
  }

  function apply(
    event: AiStreamEvent,
    patch: (changes: Partial<AiChatBubble>) => void,
    answer: () => AiChatBubble | null,
    dropIfEmpty: () => void,
  ): void {
    const current = answer();

    switch (event.type) {
      case 'token':
        patch({ content: (current?.content ?? '') + event.text });
        return;
      case 'tool':
        activity.value = event.status === 'running' ? { name: event.name, label: event.label } : null;
        return;
      case 'card':
        patch({ cards: [...(current?.cards ?? []), event.card] });
        return;
      case 'sources':
        patch({ sources: event.sources });
        return;
      case 'done':
        patch({ id: event.messageId, grounded: event.grounded, pending: false });
        activity.value = null;
        return;
      case 'error':
        patch({ pending: false });
        // Anything already spoken stays — a turn that got half an answer out
        // before the model died is still worth showing. A blank one goes.
        dropIfEmpty();
        offline.value = { message: event.message, fallback: event.fallback };
        activity.value = null;
        return;
    }
  }

  // ─── feedback (2C-11) ───────────────────────────────────────────────────────

  async function rate(
    messageId: string,
    value: AiFeedbackValue,
    reason?: AiFeedbackReason,
    comment?: string,
  ): Promise<void> {
    const id = sessionId.value;
    if (!id) return;

    // Optimistic: the thumb is the acknowledgement, and a round trip before it
    // fills makes the button feel broken.
    messages.value = messages.value.map((message) =>
      message.id === messageId ? { ...message, feedback: { value, reason: reason ?? null } } : message,
    );

    try {
      await api.post(
        `/ai/chat/sessions/${id}/messages/${messageId}/feedback`,
        { value, ...(reason ? { reason } : {}), ...(comment ? { comment } : {}) },
        { headers: chatHeaders() },
      );
    } catch {
      messages.value = messages.value.map((message) =>
        message.id === messageId ? { ...message, feedback: null } : message,
      );
    }
  }

  /** Ends the conversation and starts the next visitor from a clean thread. */
  async function reset(): Promise<void> {
    const id = sessionId.value;
    messages.value = [];
    offline.value = null;
    sessionId.value = null;
    loadedSessionId.value = null;

    if (id) {
      try {
        await api.post(`/ai/chat/sessions/${id}/close`, {}, { headers: chatHeaders() });
      } catch {
        // Closing is bookkeeping; a failure must not keep the visitor in a
        // thread they asked to leave.
      }
    }
    forget();
  }

  return {
    messages,
    sending,
    activity,
    greeting,
    offline,
    sessionId,
    channel,
    status,
    restore,
    send,
    rate,
    reset,
  };
}
