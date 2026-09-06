import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import type { MessengerStreamEvent } from './messenger.types.js';

/**
 * In-process fan-out for the live thread (1K).
 *
 * The API runs as a single PM2 fork (`deploy/ecosystem.config.cjs`), so a
 * `Map` in this process reaches every connected browser. The day a second
 * instance appears this is the one class that has to change: publish through
 * Redis pub/sub and keep the subscriber map local. Nothing else in the module
 * knows how delivery happens.
 */

/** A live SSE connection. One browser tab, one entry. */
interface Subscriber {
  userId: string;
  /** Staff see the shared inbox; a client sees only their own threads. */
  isStaff: boolean;
  channel: Subject<MessengerStreamEvent>;
}

/** Somebody typing, kept in memory only — nothing about it is worth a row. */
const TYPING_TTL_MS = 6_000;

@Injectable()
export class MessengerEventsService {
  private readonly logger = new Logger(MessengerEventsService.name);

  /** Subscriber id → connection. */
  private readonly subscribers = new Map<string, Subscriber>();

  /**
   * `conversationId` → the users with that thread on screen right now. This is
   * what decides whether a reply also raises a notification: a message landing
   * in a thread somebody is reading needs no bell.
   */
  private readonly watching = new Map<string, Map<string, number>>();

  subscribe(id: string, userId: string, isStaff: boolean, channel: Subject<MessengerStreamEvent>): void {
    this.subscribers.set(id, { userId, isStaff, channel });
  }

  unsubscribe(id: string): void {
    this.subscribers.delete(id);
  }

  /**
   * Deliver to named users plus, optionally, every connected staff member —
   * the inbox is shared, so a message to it is a message to all of them.
   */
  emit(event: MessengerStreamEvent, to: { userIds?: string[]; staff?: boolean }): void {
    const direct = new Set(to.userIds ?? []);

    for (const subscriber of this.subscribers.values()) {
      const wanted = direct.has(subscriber.userId) || (to.staff === true && subscriber.isStaff);
      if (!wanted) continue;

      try {
        subscriber.channel.next(event);
      } catch (error) {
        // A dead channel must never take the sender's request down with it.
        this.logger.warn(`Мессежийн урсгал руу бичиж чадсангүй: ${String(error)}`);
      }
    }
  }

  // ── Presence ──────────────────────────────────────────────────────────────

  /** Called when a user opens or re-reads a thread. */
  markWatching(conversationId: string, userId: string): void {
    const room = this.watching.get(conversationId) ?? new Map<string, number>();
    room.set(userId, Date.now());
    this.watching.set(conversationId, room);
  }

  stopWatching(conversationId: string, userId: string): void {
    const room = this.watching.get(conversationId);
    if (!room) return;
    room.delete(userId);
    if (!room.size) this.watching.delete(conversationId);
  }

  /**
   * True when the user has this thread open *and* a live connection. Both
   * halves matter: a tab left open on a laptop that went to sleep drops its
   * SSE connection, and that person should still get the email.
   */
  isWatching(conversationId: string, userId: string): boolean {
    const seenAt = this.watching.get(conversationId)?.get(userId);
    if (!seenAt || Date.now() - seenAt > WATCH_TTL_MS) return false;
    return this.isConnected(userId);
  }

  isConnected(userId: string): boolean {
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.userId === userId) return true;
    }
    return false;
  }

  /** Whether any staff member is connected — used to word the client's "we'll reply" line. */
  get staffOnline(): boolean {
    for (const subscriber of this.subscribers.values()) {
      if (subscriber.isStaff) return true;
    }
    return false;
  }

  /** How long a typing bubble stays up if no further keystroke arrives. */
  static readonly typingTtlMs = TYPING_TTL_MS;
}

/**
 * A watcher entry goes stale on its own: the browser refreshes it while the
 * thread is on screen, and a closed laptop simply stops refreshing.
 */
const WATCH_TTL_MS = 45_000;
