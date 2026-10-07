import type { ConversationDetail, MessageItem, MessagePageResponse } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * One open thread (1K): its messages, the composer's send, and the two live
 * signals that make a chat feel like a chat — the other side typing, and the
 * moment they read what you wrote.
 *
 * The list of threads is *not* here. A client's short list and the staff
 * inbox's filtered queue have almost nothing in common, so each page owns its
 * own; what they share is the thread itself.
 */

/** How long a "бичиж байна" bubble survives without another keystroke. */
const TYPING_TTL_MS = 6_000;

/** At most one typing ping per this interval, however fast someone types. */
const TYPING_PING_MS = 3_000;

export interface PendingMessage extends MessageItem {
  /** Sent but not yet acknowledged — rendered at reduced opacity. */
  pending?: boolean;
  /** The send failed; the bubble offers a retry rather than vanishing. */
  failed?: boolean;
  /**
   * A photo still on its way up (1K-11): an object URL of the picked file, so
   * the bubble shows it at once, and the file itself, so a retry can resend it.
   */
  localPreview?: string;
  file?: File;
}

/** Matches the API's ceiling; checked here so a 30MB pick fails before it uploads. */
export const MESSENGER_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MESSENGER_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** Why a picked file cannot be sent, or null when it can. */
export function messengerImageProblem(file: File): string | null {
  if (!MESSENGER_IMAGE_TYPES.includes(file.type)) return 'Зөвхөн JPG, PNG, WebP зураг илгээнэ үү';
  if (file.size > MESSENGER_IMAGE_MAX_BYTES) return 'Зургийн хэмжээ 20MB-с ихгүй байх ёстой';
  return null;
}

export function useMessengerThread() {
  const api = useApi();
  const stream = useMessengerStream();
  const auth = useAuthStore();

  /**
   * Which side of the thread the person at this keyboard writes on. The
   * optimistic bubble has to know: a consultant's own line belongs on their
   * right, and waiting for the server to say so would flip it across the pane.
   */
  const writesAsStaff = computed(() => auth.isDocStaff);

  const conversation = ref<ConversationDetail | null>(null);
  const messages = ref<PendingMessage[]>([]);
  const nextBefore = ref<string | null>(null);

  const pending = ref(false);
  const loadingOlder = ref(false);
  const sending = ref(false);
  const error = ref<string | null>(null);

  /** Who is typing on the other side, and when we last heard from them. */
  const typingName = ref<string | null>(null);
  const typingAt = ref(0);
  /** When the other side last read this thread — drives the "Уншсан" mark. */
  const otherReadAt = ref<string | null>(null);

  let typingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTypingPing = 0;
  let unsubscribe: (() => void) | null = null;

  const isTyping = computed(() => Boolean(typingName.value) && Date.now() - typingAt.value < TYPING_TTL_MS);

  async function open(id: string): Promise<void> {
    if (conversation.value?.id === id) return;

    // Tell the server we left the previous thread, so a reply there raises a
    // notification again instead of landing silently on a screen nobody sees.
    await leave();

    pending.value = true;
    error.value = null;
    messages.value = [];
    typingName.value = null;

    try {
      const page = await api.get<MessagePageResponse>(`/messenger/conversations/${id}/messages`);
      conversation.value = page.conversation;
      messages.value = page.items;
      nextBefore.value = page.nextBefore;
      otherReadAt.value = null;
      void stream.refreshUnread();
    } catch (cause) {
      error.value = apiErrorMessage(cause, 'Чатыг нээж чадсангүй');
      conversation.value = null;
    } finally {
      pending.value = false;
    }
  }

  /**
   * Re-reads the newest page of the open thread, keeping it open. Used after a
   * reconnect, where messages may have arrived unseen.
   */
  async function reload(): Promise<void> {
    const id = conversation.value?.id;
    if (!id) return;
    try {
      const page = await api.get<MessagePageResponse>(`/messenger/conversations/${id}/messages`);
      conversation.value = page.conversation;
      messages.value = page.items;
      nextBefore.value = page.nextBefore;
    } catch {
      // Still offline, most likely; the next reconnect will try again.
    }
  }

  async function loadOlder(): Promise<void> {
    const id = conversation.value?.id;
    if (!id || !nextBefore.value || loadingOlder.value) return;

    loadingOlder.value = true;
    try {
      const page = await api.get<MessagePageResponse>(
        `/messenger/conversations/${id}/messages?before=${nextBefore.value}`,
      );
      messages.value = [...page.items, ...messages.value];
      nextBefore.value = page.nextBefore;
    } catch (e) {
      // Silently doing nothing looks like "there is no more history".
      error.value = apiErrorMessage(e, 'Өмнөх мессежүүдийг ачаалж чадсангүй');
    } finally {
      loadingOlder.value = false;
    }
  }

  /**
   * Optimistic: the bubble appears the instant Enter is pressed and is
   * replaced by the stored row when the server answers. `clientToken` is what
   * makes that safe — a retry after a dropped connection returns the same row
   * rather than posting the line twice.
   */
  async function send(body: string): Promise<void> {
    const target = conversation.value;
    const text = body.trim();
    if (!target || !text || sending.value) return;

    const clientToken = crypto.randomUUID();
    const optimistic: PendingMessage = {
      id: `pending-${clientToken}`,
      conversationId: target.id,
      kind: 'TEXT',
      body: text,
      fromStaff: writesAsStaff.value,
      sender: null,
      clientToken,
      image: null,
      editedAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    messages.value = [...messages.value, optimistic];
    sending.value = true;

    try {
      const saved = await api.post<MessageItem>(`/messenger/conversations/${target.id}/messages`, {
        body: text,
        clientToken,
      });
      replaceOrAppend(saved);
      otherReadAt.value = null;
    } catch {
      const failed = messages.value.find((item) => item.clientToken === clientToken);
      if (failed) {
        failed.pending = false;
        failed.failed = true;
      }
    } finally {
      sending.value = false;
    }
  }

  /**
   * A photo with an optional caption (1K-11), optimistic like `send`: the
   * bubble shows the picked file from an object URL while it uploads. The
   * server does the compression, so what goes up is the original.
   */
  async function sendImage(file: File, caption = ''): Promise<void> {
    const target = conversation.value;
    if (!target || sending.value) return;

    const problem = messengerImageProblem(file);
    if (problem) {
      error.value = problem;
      return;
    }

    const clientToken = crypto.randomUUID();
    const optimistic: PendingMessage = {
      id: `pending-${clientToken}`,
      conversationId: target.id,
      kind: 'IMAGE',
      body: caption.trim(),
      fromStaff: writesAsStaff.value,
      sender: null,
      clientToken,
      image: null,
      editedAt: null,
      createdAt: new Date().toISOString(),
      pending: true,
      localPreview: URL.createObjectURL(file),
      file,
    };
    messages.value = [...messages.value, optimistic];
    sending.value = true;
    error.value = null;

    try {
      replaceOrAppend(await postImage(target.id, file, optimistic.body, clientToken));
      otherReadAt.value = null;
    } catch (cause) {
      const failed = messages.value.find((item) => item.clientToken === clientToken);
      if (failed) {
        failed.pending = false;
        failed.failed = true;
      }
      error.value = apiErrorMessage(cause, 'Зургийг илгээж чадсангүй');
    } finally {
      sending.value = false;
    }
  }

  function postImage(conversationId: string, file: File, caption: string, clientToken: string) {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('body', caption);
    form.append('clientToken', clientToken);
    return api.post<MessageItem>(`/messenger/conversations/${conversationId}/images`, form);
  }

  /** Re-sends a bubble that failed, reusing its token so it cannot double-post. */
  async function retry(message: PendingMessage): Promise<void> {
    const target = conversation.value;
    if (!target || !message.clientToken) return;

    message.failed = false;
    message.pending = true;
    try {
      const saved = message.file
        ? await postImage(target.id, message.file, message.body, message.clientToken)
        : await api.post<MessageItem>(`/messenger/conversations/${target.id}/messages`, {
            body: message.body,
            clientToken: message.clientToken,
          });
      replaceOrAppend(saved);
    } catch {
      message.pending = false;
      message.failed = true;
    }
  }

  /** Throttled — the server broadcasts this, it does not store it. */
  function ping(): void {
    const id = conversation.value?.id;
    if (!id) return;

    const now = Date.now();
    if (now - lastTypingPing < TYPING_PING_MS) return;
    lastTypingPing = now;

    void api.post(`/messenger/conversations/${id}/typing`, { typing: true }).catch(() => {
      // A dropped typing ping is not worth telling anybody about.
    });
  }

  async function leave(): Promise<void> {
    const id = conversation.value?.id;
    if (!id) return;
    await api.post(`/messenger/conversations/${id}/leave`).catch(() => {});
  }

  /** Called when the thread pane is scrolled to the bottom and visible. */
  async function markRead(): Promise<void> {
    const target = conversation.value;
    if (!target || !target.unread) return;

    target.unread = 0;
    await api.post(`/messenger/conversations/${target.id}/read`).catch(() => {});
    void stream.refreshUnread();
  }

  function replaceOrAppend(message: MessageItem): void {
    const byToken = message.clientToken
      ? messages.value.findIndex((item) => item.clientToken === message.clientToken)
      : -1;
    const index = byToken !== -1 ? byToken : messages.value.findIndex((item) => item.id === message.id);

    if (index === -1) {
      messages.value = [...messages.value, message];
      return;
    }
    // The stored photo replaces the local preview; the object URL holds the
    // whole original in memory until it is revoked.
    const previous = messages.value[index];
    if (previous?.localPreview) URL.revokeObjectURL(previous.localPreview);
    messages.value[index] = message;
  }

  /** Wires the thread to the live stream. Call once, from the page. */
  function listen(): void {
    unsubscribe?.();
    unsubscribe = stream.on((event) => {
      if (event.type === 'reconnect') {
        void reload();
        return;
      }
      if (event.conversationId !== conversation.value?.id) return;

      if (event.type === 'message') {
        replaceOrAppend(event.message);
        // Anything arriving in a thread that is on screen is read on arrival.
        typingName.value = null;
        void markRead();
        return;
      }

      if (event.type === 'typing') {
        typingName.value = event.name ?? 'Зөвлөх';
        typingAt.value = Date.now();
        if (typingTimer) clearTimeout(typingTimer);
        // Nothing re-renders on its own when the bubble expires, so nudge it.
        typingTimer = setTimeout(() => (typingName.value = null), TYPING_TTL_MS);
        return;
      }

      if (event.type === 'read') {
        otherReadAt.value = event.readAt;
      }
    });
  }

  onBeforeUnmount(() => {
    unsubscribe?.();
    if (typingTimer) clearTimeout(typingTimer);
    void leave();
  });

  return {
    conversation,
    messages,
    nextBefore,
    pending,
    loadingOlder,
    sending,
    error,
    isTyping,
    typingName,
    otherReadAt,
    open,
    loadOlder,
    send,
    sendImage,
    retry,
    ping,
    leave,
    markRead,
    listen,
    reload,
    /** Lets a page drop the thread pane without navigating away. */
    close: () => {
      void leave();
      conversation.value = null;
      messages.value = [];
    },
  };
}
