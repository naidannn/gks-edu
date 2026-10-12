import { describe, expect, it, vi } from 'vitest';
import { LeadActivityType, LeadSource, LeadStage } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { EmailService } from '../notifications/email.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import type { SlackService } from '../notifications/slack.service.js';
import type { MetaEventsService } from '../meta/meta-events.service.js';
import { LeadsService, normalizePhone } from './leads.service.js';
import type { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';

type LeadRow = { id: string; firstName?: string; lastName?: string; stage?: LeadStage; createdAt?: Date };
type ClientRow = { id: string; code: string; firstName: string; lastName: string; leadId: string | null };

const EMPTY_LEAD_FIELDS = {
  email: null,
  age: null,
  educationLevel: null,
  schoolName: null,
  gpa: null,
  gpaScale: null,
  koreanLevel: null,
  englishLevel: null,
  interestedMajor: null,
  interestedServices: [],
  interestedUniversityIds: [],
};

/**
 * Minimal Prisma double — only the calls the public-form path makes.
 * `recentLead` is a lead filed under the same number in the last hour;
 * `leads` and `clients` are what `matchPerson` finds under the number.
 */
function prismaStub(
  overrides: { recentLead?: { id: string } | null; leads?: LeadRow[]; clients?: ClientRow[]; stored?: object } = {},
) {
  const leads = [
    ...(overrides.recentLead ? [{ ...overrides.recentLead, createdAt: new Date() }] : []),
    ...(overrides.leads ?? []),
  ].map((lead) => ({
    firstName: 'Тэмүүлэн',
    lastName: 'Батбаяр',
    stage: LeadStage.NEW,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    ...lead,
  }));

  const prisma = {
    lead: {
      findMany: vi.fn().mockResolvedValue(leads),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...EMPTY_LEAD_FIELDS, ...overrides.stored }),
      update: vi.fn().mockResolvedValue({}),
      // Mirrors the `select` on the real create — the staff notification reads
      // these fields straight off the returned row.
      create: vi.fn().mockResolvedValue({
        id: 'new-lead',
        firstName: 'Бат',
        lastName: 'Дорж',
        phone: '+97699112233',
        email: 'test@example.com',
        source: LeadSource.WEBSITE,
        interestedServices: [],
      }),
    },
    client: { findMany: vi.fn().mockResolvedValue(overrides.clients ?? []) },
    leadActivity: { create: vi.fn().mockResolvedValue({ id: 'activity' }) },
    university: { findMany: vi.fn().mockResolvedValue([{ id: 'uni-1' }]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((writes: Promise<unknown>[]) => Promise.all(writes)),
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

/** 1A-17 dispatches to staff; the public-form tests only care that it is called. */
function notificationsStub() {
  return { dispatch: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
}

function emailStub() {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    link: (path: string) => `https://gksedu.mn${path}`,
  } as unknown as EmailService;
}

function slackStub() {
  return { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService;
}

/** The Meta funnel is fire-and-forget; these tests only need it not to be undefined. */
function metaStub() {
  return { track: vi.fn().mockResolvedValue(undefined) } as unknown as MetaEventsService;
}

const base: CreatePublicLeadDto = {
  lastName: 'Батбаяр',
  firstName: 'Тэмүүлэн',
  phone: '99112233',
};

describe('normalizePhone', () => {
  it.each([
    ['9911-2233', '99112233'],
    ['+976 9911 2233', '99112233'],
    ['(976) 9911-2233', '99112233'],
    ['99112233', '99112233'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('LeadsService.createFromPublicForm', () => {
  it('creates a lead with an opening activity', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    const result = await service.createFromPublicForm({
      ...base,
      phone: '+976 9911-2233',
      email: 'Test@Example.com ',
      interestedUniversitySlugs: ['ajou-university'],
    });

    expect(result.merged).toBe(false);
    const data = prisma.lead.create.mock.calls[0]![0].data;
    expect(data.phone).toBe('99112233');
    expect(data.email).toBe('test@example.com');
    expect(data.source).toBe(LeadSource.WEBSITE);
    expect(data.stage).toBe(LeadStage.NEW);
    expect(data.interestedUniversityIds).toEqual(['uni-1']);
    expect(data.activities.create.type).toBe(LeadActivityType.NOTE);
  });

  it('drops honeypot submissions without writing anything', async () => {
    const prisma = prismaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    const result = await service.createFromPublicForm({ ...base, website: 'http://spam.example' });

    expect(result.merged).toBe(false);
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).not.toHaveBeenCalled();
  });

  it('merges a repeat submission from the same number into the existing lead', async () => {
    const prisma = prismaStub({ recentLead: { id: 'existing-lead' } });
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    const result = await service.createFromPublicForm({ ...base, note: 'Дахин холбогдлоо' });

    expect(result).toEqual({ id: 'existing-lead', merged: true });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'existing-lead', body: 'Дахин холбогдлоо' }),
    });
  });

  /**
   * 1N-39 — a nervous visitor pressing the button twice is one lead, so it has
   * to be one conversion. The browser mints a fresh `event_id` on every submit,
   * so reporting that id counted the person twice and taught the campaign to
   * look for more like them.
   */
  it('reports a repeat submission under the original lead id, so Meta deduplicates it', async () => {
    const prisma = prismaStub({ recentLead: { id: 'existing-lead' } });
    const meta = metaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), meta);

    await service.createFromPublicForm({ ...base, tracking: { eventId: 'browser-event-2' } });

    const tracked = (meta.track as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { eventId: string };
    expect(tracked.eventId).toBe('existing-lead');
  });

  it('still honours the browser event id on a first submission', async () => {
    const prisma = prismaStub();
    const meta = metaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), meta);

    await service.createFromPublicForm({ ...base, tracking: { eventId: 'browser-event-1' } });

    const tracked = (meta.track as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { eventId: string };
    expect(tracked.eventId).toBe('browser-event-1');
  });

  /**
   * 1B-21 — the QR code on the office wall. The person is sitting in the
   * waiting area, so nobody should email them "we will call you", and a walk-in
   * is not something a Meta campaign produced.
   */
  it('files an office QR registration as a visit, without the ad-funnel side effects', async () => {
    const prisma = prismaStub();
    const email = emailStub();
    const meta = metaStub();
    const service = new LeadsService(prisma, notificationsStub(), email, slackStub(), meta);

    await service.createFromPublicForm(
      { ...base, email: 'visitor@example.com', schoolName: ' 1-р сургууль ', note: 'GKS-ийн талаар' },
      {},
      { source: LeadSource.OFFICE },
    );

    const data = prisma.lead.create.mock.calls[0]![0].data;
    expect(data.source).toBe(LeadSource.OFFICE);
    // The visit is the contact — it does not wait in NEW for a call.
    expect(data.stage).toBe(LeadStage.CONTACTED);
    expect(data.schoolName).toBe('1-р сургууль');
    expect(data.activities.create).toMatchObject({
      type: LeadActivityType.MEETING,
      body: 'Оффис дээр ирж, QR кодоор бүртгүүлсэн\n\nGKS-ийн талаар',
      meta: { channel: 'office_qr' },
    });
    expect(email.send).not.toHaveBeenCalled();
    expect(meta.track).not.toHaveBeenCalled();
  });

  it('logs a repeat office registration on the existing lead', async () => {
    const prisma = prismaStub({ recentLead: { id: 'existing-lead' } });
    const meta = metaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), meta);

    const result = await service.createFromPublicForm(base, {}, { source: LeadSource.OFFICE });

    expect(result).toEqual({ id: 'existing-lead', merged: true });
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: 'existing-lead',
        type: LeadActivityType.MEETING,
        body: 'Оффис дээр ирж, QR кодоор дахин бүртгүүлсэн',
      }),
    });
    expect(prisma.lead.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'existing-lead' },
      data: { stage: LeadStage.CONTACTED },
    });
    expect(meta.track).not.toHaveBeenCalled();
  });

  // ─── 1B-26: one person, one record ─────────────────────────────────────────

  it('files a repeat on the open lead with the same name, however long ago it came in', async () => {
    const prisma = prismaStub({ leads: [{ id: 'website-lead', firstName: 'Temuulen' }] });
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    // The website form a fortnight ago was typed in Latin; the QR today in Cyrillic.
    const result = await service.createFromPublicForm(base, {}, { source: LeadSource.OFFICE });

    expect(result).toEqual({ id: 'website-lead', merged: true });
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it('opens a new lead when an old one on the number has another name — a sibling on a parent\'s phone', async () => {
    const prisma = prismaStub({ leads: [{ id: 'sister', firstName: 'Ариунжаргал' }] });
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    const result = await service.createFromPublicForm({ ...base, firstName: 'Ариунзаяа' });

    expect(result.merged).toBe(false);
    expect(prisma.lead.create).toHaveBeenCalled();
  });

  it('fills what the earlier submission left empty, and learns the name a chat never got', async () => {
    const prisma = prismaStub({
      leads: [{ id: 'chat-lead', firstName: '—', lastName: '—' }],
      stored: { email: 'kept@example.com', interestedServices: ['GKS'] },
    });
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    await service.createFromPublicForm({
      ...base,
      email: 'new@example.com',
      gpa: 3.6,
      interestedServices: ['BACHELOR'],
    } as CreatePublicLeadDto);

    const data = prisma.lead.update.mock.calls[0]![0].data;
    expect(data).toMatchObject({ firstName: 'Тэмүүлэн', lastName: 'Батбаяр', gpa: 3.6 });
    expect(data.email).toBeUndefined();
    expect(data.interestedServices).toEqual(['GKS', 'BACHELOR']);
  });

  it('does not file an existing client as a new lead — the office is told instead', async () => {
    const prisma = prismaStub({
      clients: [{ id: 'client-1', code: 'KH-2026-0058', firstName: 'Тэмүүлэн', lastName: 'Батбаяр', leadId: 'their-lead' }],
    });
    const slack = slackStub();
    const meta = metaStub();
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slack, meta);

    const result = await service.createFromPublicForm({ ...base, note: 'Визний талаар асуух гэсэн юм' });

    expect(result).toEqual({ id: 'their-lead', merged: true, client: { id: 'client-1', code: 'KH-2026-0058' } });
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.leadActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: 'their-lead', body: 'Визний талаар асуух гэсэн юм' }),
    });
    expect((slack.notify as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      link: { path: '/admin/clients/client-1' },
    });
    expect(meta.track).not.toHaveBeenCalled();
  });

  it('still opens a lead for a client\'s sibling enquiring on the same phone', async () => {
    const prisma = prismaStub({
      clients: [{ id: 'client-1', code: 'KH-2026-0058', firstName: 'Анужин', lastName: 'Батбаяр', leadId: null }],
    });
    const service = new LeadsService(prisma, notificationsStub(), emailStub(), slackStub(), metaStub());

    const result = await service.createFromPublicForm(base);

    expect(result.client).toBeUndefined();
    expect(prisma.lead.create).toHaveBeenCalled();
  });
});
