import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ConversationStatus, Role } from '../../prisma/client.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { MessengerEventsService } from './messenger-events.service.js';
import { MessengerService } from './messenger.service.js';
import type { MessengerStreamEvent } from './messenger.types.js';

const CLIENT: AuthenticatedUser = { id: 'user-1', email: 'client@test.mn', role: Role.USER };
const STAFF: AuthenticatedUser = { id: 'staff-1', email: 'consultant@test.mn', role: Role.CONSULTANT };

/** A thread row shaped like `CONVERSATION_DETAIL_SELECT`. */
function conversationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conv-1',
    code: 'CH-2026-0001',
    subject: 'Сургууль сонгох',
    topic: 'GENERAL',
    status: ConversationStatus.OPEN,
    caseId: null,
    case: null,
    assignee: null,
    lastMessageAt: new Date('2026-09-06T10:00:00Z'),
    lastMessagePreview: 'Сайн байна уу',
    lastMessageFromStaff: false,
    clientUnread: 0,
    staffUnread: 1,
    createdAt: new Date('2026-09-06T10:00:00Z'),
    firstResponseAt: null,
    resolvedAt: null,
    clientUserId: CLIENT.id,
    clientUser: {
      id: CLIENT.id,
      name: 'Дорж Батболд',
      role: Role.USER,
      email: 'client@test.mn',
      phone: '99112233',
      client: { code: 'KH-2026-0007' },
      cases: [{ stage: 'DOCUMENTS' }],
    },
    ...overrides,
  };
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    kind: 'TEXT',
    body: 'Сайн байна уу',
    fromStaff: false,
    clientToken: null,
    editedAt: null,
    createdAt: new Date('2026-09-06T10:00:00Z'),
    sender: { id: CLIENT.id, name: 'Дорж Батболд', role: Role.USER },
    ...overrides,
  };
}

function makeService(overrides: {
  conversation?: Record<string, unknown> | null;
  updated?: Record<string, unknown>;
  existingMessage?: Record<string, unknown> | null;
} = {}) {
  const conversationUpdate = vi.fn().mockResolvedValue(overrides.updated ?? conversationRow());
  const messageCreate = vi.fn().mockResolvedValue(messageRow());

  const tx = {
    conversation: {
      create: vi.fn().mockResolvedValue({ id: 'conv-1' }),
      update: conversationUpdate,
      findUniqueOrThrow: vi.fn().mockResolvedValue(conversationRow()),
      // `generateCode` reads the highest code issued this year, not a count.
      findFirst: vi.fn().mockResolvedValue(null),
    },
    message: { create: messageCreate },
  };

  const prisma = {
    conversation: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.conversation === undefined ? conversationRow() : overrides.conversation),
      update: conversationUpdate,
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: {} }),
    },
    message: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingMessage ?? null),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: messageCreate,
    },
    user: { findUnique: vi.fn().mockResolvedValue({ name: 'Сараа' }), findFirst: vi.fn(), findMany: vi.fn() },
    case: { findFirst: vi.fn().mockResolvedValue({ id: 'case-1' }) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const events = new MessengerEventsService();
  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;
  const slack = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService;

  const service = new MessengerService(prisma, events, notifications, slack);
  return { service, prisma, events, notifications, slack, tx, conversationUpdate, messageCreate };
}

describe('MessengerService', () => {
  it('hides another client\'s thread behind the same 404 as a missing one', async () => {
    const { service } = makeService({ conversation: conversationRow({ clientUserId: 'someone-else' }) });

    await expect(service.send({ ...CLIENT, id: 'user-2' }, 'conv-1', { body: 'Сайн уу' })).rejects.toThrow(
      'Чат олдсонгүй',
    );
  });

  it('lets any staff member into any thread — the inbox is shared', async () => {
    const { service, messageCreate } = makeService();
    await service.send(STAFF, 'conv-1', { body: 'Тийм ээ, тусалъя' });
    expect(messageCreate).toHaveBeenCalled();
  });

  it('claims an unassigned thread for whoever answers it first', async () => {
    const { service, conversationUpdate } = makeService();
    await service.send(STAFF, 'conv-1', { body: 'Сайн байна уу' });

    const data = conversationUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.assigneeId).toBe(STAFF.id);
    expect(data.firstResponseAt).toBeInstanceOf(Date);
    expect(data.clientUnread).toEqual({ increment: 1 });
    expect(data.staffUnread).toBe(0);
  });

  it('leaves an already-claimed thread with its assignee', async () => {
    const { service, conversationUpdate } = makeService({
      conversation: conversationRow({ assignee: { id: 'staff-9', name: 'Болд', role: Role.CONSULTANT } }),
    });
    await service.send(STAFF, 'conv-1', { body: 'Нэмэлт мэдээлэл' });

    const data = conversationUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.assigneeId).toBeUndefined();
  });

  it('reopens a resolved thread when either side writes again', async () => {
    const { service, conversationUpdate } = makeService({
      conversation: conversationRow({ status: ConversationStatus.RESOLVED }),
    });
    await service.send(CLIENT, 'conv-1', { body: 'Дахиад нэг асуулт байна' });

    const data = conversationUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe(ConversationStatus.OPEN);
    expect(data.resolvedAt).toBeNull();
  });

  it('returns the stored row for a retried send instead of posting twice', async () => {
    const stored = messageRow({ id: 'msg-stored', clientToken: 'tok-1' });
    const { service, messageCreate } = makeService({ existingMessage: stored });

    const result = await service.send(CLIENT, 'conv-1', { body: 'Сайн уу', clientToken: 'tok-1' });

    expect(result.id).toBe('msg-stored');
    expect(messageCreate).not.toHaveBeenCalled();
  });

  it('raises a notification for a staff reply only when the client is not watching', async () => {
    const away = makeService();
    await away.service.send(STAFF, 'conv-1', { body: 'Хариу' });
    expect(away.notifications.dispatch).toHaveBeenCalledTimes(1);

    const watching = makeService();
    // A live connection *and* the thread on screen — both are required.
    watching.events.subscribe('sub-1', CLIENT.id, false, new Subject<MessengerStreamEvent>());
    watching.events.markWatching('conv-1', CLIENT.id);
    await watching.service.send(STAFF, 'conv-1', { body: 'Хариу' });
    expect(watching.notifications.dispatch).not.toHaveBeenCalled();
  });

  it('treats a tab whose connection dropped as away, however recently it was watching', async () => {
    const { service, events, notifications } = makeService();
    events.markWatching('conv-1', CLIENT.id); // no subscribe: the laptop slept
    await service.send(STAFF, 'conv-1', { body: 'Хариу' });
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });

  it('posts a new thread to Slack, but not every follow-up line while staff are online', async () => {
    const fresh = makeService();
    await fresh.service.start(CLIENT, { body: 'Сайн байна уу, GKS тэтгэлгийн талаар асуумаар байна' });
    expect(fresh.slack.notify).toHaveBeenCalledTimes(1);

    const online = makeService();
    online.events.subscribe('sub-staff', STAFF.id, true, new Subject<MessengerStreamEvent>());
    await online.service.send(CLIENT, 'conv-1', { body: 'Нэмэлт асуулт' });
    expect(online.slack.notify).not.toHaveBeenCalled();

    const afterHours = makeService();
    await afterHours.service.send(CLIENT, 'conv-1', { body: 'Шөнө бичсэн асуулт' });
    expect(afterHours.slack.notify).toHaveBeenCalledTimes(1);
  });

  it('names a thread after its first sentence when the client did not title it', async () => {
    const { service, tx } = makeService();
    await service.start(CLIENT, {
      body: 'Сайн байна уу.\n\nЯаж бүртгүүлэх вэ гэдгийг тодруулж өгөөч, баярлалаа.',
    });

    const data = tx.conversation.create.mock.calls[0]?.[0].data as { subject: string };
    expect(data.subject).toBe('Сайн байна уу. Яаж бүртгүүлэх вэ гэдгийг тодруулж өгөөч…');
    expect(data.subject.length).toBeLessThanOrEqual(60);
  });

  it('will not let a staff account open a thread against itself', async () => {
    const { service } = makeService();
    await expect(service.start(STAFF, { body: 'Тест' })).rejects.toThrow(
      'Ажилтан өөртэйгөө чат эхлүүлэх боломжгүй',
    );
  });

  it('does not write to the database when there is nothing unread to clear', async () => {
    const { service, prisma } = makeService({ conversation: conversationRow({ clientUnread: 0 }) });
    const result = await service.markRead(CLIENT, 'conv-1');

    expect(result).toBeNull();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('keeps the client\'s own contact details out of their own payload', async () => {
    const { service } = makeService();
    const { conversation } = await service.messages(CLIENT, 'conv-1', { limit: 40 });

    expect(conversation.client.phone).toBeNull();
    expect(conversation.client.email).toBeNull();
    // Staff see them, because those are what they act on.
    const staffView = await service.messages(STAFF, 'conv-1', { limit: 40 });
    expect(staffView.conversation.client.phone).toBe('99112233');
  });

  it('tells staff whether the person writing has paid for a service', async () => {
    const { service, prisma } = makeService();
    const visitor = conversationRow({
      clientUser: { ...conversationRow().clientUser, client: null, cases: [] },
    });
    const unpaid = conversationRow({
      clientUser: { ...conversationRow().clientUser, cases: [{ stage: 'CONTRACT_SIGNED' }] },
    });
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([conversationRow(), unpaid, visitor] as never);

    const inbox = await service.inbox(STAFF, { page: 1, limit: 25, scope: 'OPEN' as never });
    expect(inbox.items.map((item) => item.client.phase)).toEqual(['ACTIVE', 'PREPARING', null]);

    // The client is not shown their own standing.
    const own = await service.messages(CLIENT, 'conv-1', { limit: 40 });
    expect(own.conversation.client.phase).toBeNull();
  });

  it('shows each side its own unread count from the same row', async () => {
    const { service, prisma } = makeService();
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([conversationRow()] as never);

    const mine = await service.listMine(CLIENT.id, { page: 1, limit: 20 });
    expect(mine.items[0]?.unread).toBe(0);

    const inbox = await service.inbox(STAFF, { page: 1, limit: 25, scope: 'OPEN' as never });
    expect(inbox.items[0]?.unread).toBe(1);
  });
});

/**
 * 1N-42 — resolving a thread from the inbox left `staffUnread` standing, and
 * the badge did not filter by status, so the navigation kept counting a thread
 * that had left the open inbox and nobody could find what to click.
 */
describe('MessengerService unread bookkeeping (1N-42)', () => {
  it('clears the staff counter when a thread is resolved', async () => {
    const { service, conversationUpdate } = makeService();

    await service.setStatus(STAFF, 'conv-1', ConversationStatus.RESOLVED);

    const data = conversationUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.status).toBe(ConversationStatus.RESOLVED);
    expect(data.staffUnread).toBe(0);
    expect(data.staffReadAt).toBeInstanceOf(Date);
  });

  it('does not touch the counter when a thread is merely reopened', async () => {
    const { service, conversationUpdate } = makeService({
      conversation: conversationRow({ status: ConversationStatus.RESOLVED }),
    });

    await service.setStatus(STAFF, 'conv-1', ConversationStatus.OPEN);

    const data = conversationUpdate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('staffUnread');
  });

  it('keeps resolved threads out of the staff badge', async () => {
    const { service, prisma } = makeService();
    await service.unreadSummary(STAFF);

    const where = vi.mocked(prisma.conversation.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.staffUnread).toEqual({ gt: 0 });
    expect(where.status).toEqual({ not: ConversationStatus.RESOLVED });
  });

  it('leaves the client badge counting a resolved thread — the answer is still unread', async () => {
    const { service, prisma } = makeService();
    await service.unreadSummary(CLIENT);

    const where = vi.mocked(prisma.conversation.count).mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where).toEqual({ clientUserId: CLIENT.id, clientUnread: { gt: 0 } });
  });

  it('reads the thread once when opening it, not twice', async () => {
    const { service, prisma } = makeService();

    await service.messages(STAFF, 'conv-1', { limit: 40 });

    // One `load`, and `markReadOn` reuses it instead of fetching the row again.
    expect(vi.mocked(prisma.conversation.findUnique)).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.update).toHaveBeenCalled();
  });

  // ── The office writing first (1K-13) ──────────────────────────────────────

  it('opens a staff-started thread claimed, read, and waiting on the client', async () => {
    const { service, prisma, tx } = makeService();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: CLIENT.id } as never);

    await service.startForClient(STAFF, {
      clientUserId: CLIENT.id,
      body: 'Сайн байна уу. Паспортын хуулбар дутуу байна.',
    });

    const data = tx.conversation.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.lastMessageFromStaff).toBe(true);
    // Never in the unclaimed queue: the office knows whose thread this is.
    expect(data.assigneeId).toBe(STAFF.id);
    expect(data.firstResponseAt).toBeInstanceOf(Date);
    expect(data.clientUnread).toBe(1);
    expect(data.staffUnread).toBeUndefined();

    const message = tx.message.create.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(message.fromStaff).toBe(true);
    expect(message.senderId).toBe(STAFF.id);
  });

  it('will not let the office write to somebody who never signed a contract', async () => {
    const { service, prisma, tx } = makeService();
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    await expect(service.startForClient(STAFF, { clientUserId: CLIENT.id, body: 'Сайн уу' })).rejects.toThrow(
      'Гэрээтэй хэрэглэгч олдсонгүй',
    );
    expect(tx.conversation.create).not.toHaveBeenCalled();
  });

  it('keeps a client out of the staff-side start route', async () => {
    const { service } = makeService();
    await expect(service.startForClient(CLIENT, { clientUserId: 'user-2', body: 'Сайн уу' })).rejects.toThrow(
      'Зөвхөн ажилтан чат эхлүүлнэ',
    );
  });

  it('bells the client about a thread the office started, and spares Slack', async () => {
    const { service, prisma, notifications, slack } = makeService();
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: CLIENT.id } as never);

    await service.startForClient(STAFF, { clientUserId: CLIENT.id, body: 'Танд мэдэгдэх зүйл байна' });

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    // The office started it; telling the office about it is noise.
    expect(slack.notify).not.toHaveBeenCalled();
  });

  it('hands the recipient picker the open thread that person already has', async () => {
    const { service, prisma } = makeService();
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: CLIENT.id,
        name: null,
        email: 'client@test.mn',
        phone: '99112233',
        client: { code: 'KH-2026-0007', lastName: 'Дорж', firstName: 'Батболд' },
        cases: [{ id: 'case-1', code: 'KH-2026-0007-1', serviceType: 'BACHELOR', stage: 'DOCUMENTS' }],
        conversations: [{ id: 'conv-1', code: 'CH-2026-0001' }],
      },
    ] as never);

    const [row] = await service.recipients({});

    // No account name, but the contract always has one.
    expect(row?.name).toBe('Дорж Батболд');
    expect(row?.phase).toBe('ACTIVE');
    expect(row?.openConversationCode).toBe('CH-2026-0001');
    expect(row?.cases).toEqual([{ id: 'case-1', code: 'KH-2026-0007-1', serviceType: 'BACHELOR' }]);
  });
});

describe('MessengerEventsService', () => {
  it('delivers to named users and to every connected staff member', () => {
    const events = new MessengerEventsService();
    const client = new Subject<MessengerStreamEvent>();
    const staff = new Subject<MessengerStreamEvent>();
    const otherClient = new Subject<MessengerStreamEvent>();

    const seen: string[] = [];
    client.subscribe(() => seen.push('client'));
    staff.subscribe(() => seen.push('staff'));
    otherClient.subscribe(() => seen.push('other'));

    events.subscribe('a', 'user-1', false, client);
    events.subscribe('b', 'staff-1', true, staff);
    events.subscribe('c', 'user-2', false, otherClient);

    events.emit({ type: 'ping', conversationId: null }, { userIds: ['user-1'], staff: true });

    expect(seen.sort()).toEqual(['client', 'staff']);
  });

  it('stops delivering once a connection is dropped', () => {
    const events = new MessengerEventsService();
    const channel = new Subject<MessengerStreamEvent>();
    let received = 0;
    channel.subscribe(() => (received += 1));

    events.subscribe('a', 'user-1', false, channel);
    events.unsubscribe('a');
    events.emit({ type: 'ping', conversationId: null }, { userIds: ['user-1'] });

    expect(received).toBe(0);
    expect(events.isConnected('user-1')).toBe(false);
  });
});
