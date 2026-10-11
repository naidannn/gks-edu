import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessLevel,
  ChatChannel,
  ChatSessionStatus,
  EducationLevel,
  LeadSource,
  ServiceType,
  type ChatSession,
} from '../../../../prisma/client.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import type { LeadsService } from '../../../leads/leads.service.js';
import { LeadTools } from './lead.tools.js';
import { ToolArgumentError, type AiTool, type ToolContext } from './tool.types.js';

/**
 * The sales loop's two tools (2C-05, 2C-06).
 *
 * Everything tested here is a rule the model is *also* told in words, which is
 * exactly why it is tested: a description is a request, and a model under
 * pressure to be helpful will talk itself past one. These are the cases where
 * being talked past costs somebody a phone call they did not ask for.
 */
function harness(options: { session?: Partial<ChatSession & { profile: unknown }>; client?: unknown } = {}) {
  const sessionRow = {
    profile: {},
    leadId: null,
    utm: null,
    ...options.session,
  };

  const prisma = {
    chatSession: {
      findUnique: vi.fn().mockResolvedValue(sessionRow),
      findUniqueOrThrow: vi.fn().mockResolvedValue(sessionRow),
      update: vi.fn().mockResolvedValue({}),
    },
    client: { findFirst: vi.fn().mockResolvedValue(options.client ?? null) },
    leadActivity: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;

  const leads = {
    createFromPublicForm: vi.fn().mockResolvedValue({ id: 'lead-1', merged: false }),
  } as unknown as LeadsService;

  const provider = new LeadTools(prisma, leads);
  const [profileTool, requestTool] = provider.tools() as [AiTool, AiTool];

  return { profileTool, requestTool, prisma, leads };
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    level: AccessLevel.PUBLIC,
    session: {
      id: 'session-1',
      code: 'AI-2026-0001',
      channel: ChatChannel.WEB_WIDGET,
      status: ChatSessionStatus.ACTIVE,
    } as ChatSession,
    userId: null,
    now: new Date('2026-09-14T00:00:00Z'),
    ...overrides,
  };
}

describe('save_visitor_profile', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a decimal grade instead of truncating it', async () => {
    const { profileTool, prisma } = harness();

    await profileTool.run({ gpa: 3.8, gpaScale: '4.0' }, context());

    // 3.8 read as an integer is a 3.0 student, and the lead card that a
    // consultant reads afterwards would not show the difference.
    expect(vi.mocked(prisma.chatSession.update).mock.calls[0]![0].data.profile).toMatchObject({
      gpa: 3.8,
      gpaScale: '4.0',
    });
  });

  it('merges into what is already known rather than replacing it', async () => {
    const { profileTool, prisma } = harness({
      session: { profile: { educationLevel: 'SECONDARY_SCHOOL', koreanLevel: 'TOPIK 2' } },
    });

    await profileTool.run({ goalLevel: 'BACHELOR' }, context());

    expect(vi.mocked(prisma.chatSession.update).mock.calls[0]![0].data.profile).toMatchObject({
      educationLevel: 'SECONDARY_SCHOOL',
      koreanLevel: 'TOPIK 2',
      goalLevel: ServiceType.BACHELOR,
    });
  });

  it('cannot un-decline a visitor who has already refused their number', async () => {
    const { profileTool, prisma } = harness({ session: { profile: { contactDeclined: true } } });

    // §6.2: a refusal ends the subject for the session. A later call — the
    // model's own, or one talked into it — must not reopen it.
    await profileTool.run({ contactDeclined: false, name: 'Болд' }, context());

    expect(vi.mocked(prisma.chatSession.update).mock.calls[0]![0].data.profile).toMatchObject({
      contactDeclined: true,
      name: 'Болд',
    });
  });

  it('tells the model what it still does not know', async () => {
    const { profileTool } = harness({ session: { profile: { educationLevel: 'BACHELOR' } } });

    const outcome = await profileTool.run({ koreanLevel: 'TOPIK 4' }, context());

    expect(outcome.data).toMatchObject({
      missing: ['gpa', 'goalLevel', 'budget', 'timing'],
    });
  });

  it('drops a value that is not on the enum instead of storing the model’s wording', async () => {
    const { profileTool, prisma } = harness();

    await profileTool.run({ educationLevel: 'колледж', goalLevel: 'bachelor' }, context());

    const saved = vi.mocked(prisma.chatSession.update).mock.calls[0]![0].data.profile as Record<string, unknown>;
    expect(saved.educationLevel).toBeUndefined();
    // Case is forgiven, invention is not.
    expect(saved.goalLevel).toBe(ServiceType.BACHELOR);
  });
});

describe('create_consultation_request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses to run without a phone number the visitor gave', async () => {
    const { requestTool, leads } = harness();

    await expect(
      requestTool.run({ summary: 'Бакалаврт орохыг хүсэж байна' }, context()),
    ).rejects.toBeInstanceOf(ToolArgumentError);

    expect(leads.createFromPublicForm).not.toHaveBeenCalled();
  });

  it('files the lead as AI_CHAT through the website’s own path', async () => {
    const { requestTool, leads } = harness({
      session: { profile: { educationLevel: EducationLevel.SECONDARY_SCHOOL, gpa: 3.4, koreanLevel: 'TOPIK 3' } },
    });

    await requestTool.run(
      { phone: '99112233', name: 'Батын Болд', summary: 'Хэлний бэлтгэлд 2027.03-д элсэхийг хүсэж байна.' },
      context(),
    );

    const [dto, , origin] = vi.mocked(leads.createFromPublicForm).mock.calls[0]!;
    expect(origin).toMatchObject({ source: LeadSource.AI_CHAT });
    // The profile the conversation collected travels with it — a consultant
    // should not have to ask again for what was already said.
    expect(dto).toMatchObject({
      phone: '99112233',
      firstName: 'Батын',
      lastName: 'Болд',
      educationLevel: EducationLevel.SECONDARY_SCHOOL,
      gpa: 3.4,
      koreanLevel: 'TOPIK 3',
    });
  });

  it('files one enquiry per conversation, however often it is called', async () => {
    const { requestTool, leads } = harness({ session: { leadId: 'lead-existing' } });

    const outcome = await requestTool.run({ phone: '99112233', summary: 'Дахин' }, context());

    expect(leads.createFromPublicForm).not.toHaveBeenCalled();
    expect(outcome.data).toMatchObject({ created: false });
  });

  it('does not turn an existing client into a fresh lead', async () => {
    const { requestTool, leads, prisma } = harness({
      client: { id: 'client-1', code: 'C-2026-0007', leadId: 'lead-old' },
    });

    const outcome = await requestTool.run(
      { phone: '99112233', summary: 'Визний талаар асуув' },
      context({ userId: 'user-1' }),
    );

    // Somebody with a contract already has a consultant. A new lead would put
    // a second person on the phone to them.
    expect(leads.createFromPublicForm).not.toHaveBeenCalled();
    expect(outcome.data).toMatchObject({ alreadyClient: true });
    expect(vi.mocked(prisma.leadActivity.create).mock.calls[0]![0].data).toMatchObject({
      leadId: 'lead-old',
      type: 'CHAT',
    });
  });

  it('says so when the number already asked today, rather than promising a second call', async () => {
    const { requestTool, leads } = harness();
    vi.mocked(leads.createFromPublicForm).mockResolvedValue({ id: 'lead-1', merged: true });

    const outcome = await requestTool.run({ phone: '99112233', summary: 'Дахин' }, context());

    expect(outcome.data).toMatchObject({ created: true, repeat: true });
  });

  it('records the phone on the session so the next turn stops asking for it', async () => {
    const { requestTool, prisma } = harness();

    await requestTool.run({ phone: '99112233', name: 'Болд', summary: 'Асуулт' }, context());

    const update = vi.mocked(prisma.chatSession.update).mock.calls[0]![0].data;
    expect(update).toMatchObject({ leadId: 'lead-1', outcome: 'LEAD_CREATED' });
    expect(update.profile).toMatchObject({ phone: '99112233', name: 'Болд' });
  });

  it('promises no callback within the hour — nothing yet schedules that call', async () => {
    const { requestTool } = harness();

    const outcome = await requestTool.run({ phone: '99112233', summary: 'Асуулт' }, context());

    expect(JSON.stringify(outcome.data)).not.toMatch(/1 цагийн дотор/);
  });

  describe('the agreed time', () => {
    // 2026-10-10 is a Saturday; context() is 2026-09-14, so move "now" to Saturday 16:12.
    const saturday = context({ now: new Date('2026-10-10T08:12:00Z') });

    it('puts the time on the first line of the lead, with our weekday', async () => {
      const { requestTool, leads } = harness();

      const outcome = await requestTool.run(
        { phone: '99112233', summary: 'Бакалавр', visitDate: '2026-10-12', visitTime: '14:00', contactMode: 'OFFICE' },
        saturday,
      );

      const [dto] = vi.mocked(leads.createFromPublicForm).mock.calls[0]!;
      expect(dto.note).toMatch(/^Тохирсон цаг: 2026-10-12 \(Даваа\) 14:00, оффис дээр уулзах\./);
      expect(outcome.data).toMatchObject({ цаг_тохирох_эсэх: 'тохирсон', гараг: 'Даваа' });
    });

    it('files the lead but flags a Sunday visit, and tells the model to offer another time', async () => {
      // Production, thread 19ddc578: "Маргааш (10-11) 09:00–18:00 ажиллана" on a Saturday.
      const { requestTool, leads } = harness();

      const outcome = await requestTool.run(
        { phone: '99112233', summary: 'Бакалавр', visitDate: '2026-10-11', visitTime: '16:00' },
        saturday,
      );

      const [dto] = vi.mocked(leads.createFromPublicForm).mock.calls[0]!;
      expect(dto.note).toMatch(/^⚠ Хүссэн цаг тохирохгүй/);
      expect(outcome.data).toMatchObject({ created: true, цаг_тохирох_эсэх: 'тохирохгүй', гараг: 'Ням' });
      expect((outcome.data as { message: string }).message).toContain('ажлын цагийн хүрээг');
    });

    it('rejects a Saturday hour before the office opens', async () => {
      const { requestTool } = harness();

      const outcome = await requestTool.run(
        { phone: '99112233', summary: 'Асуулт', visitDate: '2026-10-17', visitTime: '10:00' },
        saturday,
      );

      expect(outcome.data).toMatchObject({ цаг_тохирох_эсэх: 'тохирохгүй' });
      expect((outcome.data as { шалтгаан: string }).шалтгаан).toContain('11:00–18:00');
    });

    it('takes a day without an hour, since visitors may come any time we are open', async () => {
      const { requestTool, leads } = harness();

      const outcome = await requestTool.run(
        { phone: '99112233', summary: 'Ирнэ', visitDate: '2026-10-12', contactMode: 'OFFICE' },
        saturday,
      );

      const [dto] = vi.mocked(leads.createFromPublicForm).mock.calls[0]!;
      expect(dto.note).toMatch(/^Тохирсон цаг: 2026-10-12 \(Даваа\), ажлын цагаар, оффис дээр уулзах\./);
      expect(outcome.data).toMatchObject({ цаг_тохирох_эсэх: 'тохирсон' });
    });

    it('needs no hour for a chat consultation', async () => {
      const { requestTool } = harness();

      const outcome = await requestTool.run({ phone: '99112233', summary: 'Чатаар', contactMode: 'ONLINE' }, saturday);

      expect(outcome.data).toMatchObject({ цаг_тохирох_эсэх: 'тохирсон' });
    });

    it('writes a changed time onto the lead that already exists', async () => {
      const { requestTool, prisma, leads } = harness({ session: { leadId: 'lead-9' } });

      const outcome = await requestTool.run(
        { phone: '99112233', summary: 'Мягмар болгосон', visitDate: '2026-10-13', visitTime: '15:00' },
        saturday,
      );

      expect(leads.createFromPublicForm).not.toHaveBeenCalled();
      expect(vi.mocked(prisma.leadActivity.create).mock.calls[0]![0].data).toMatchObject({
        leadId: 'lead-9',
        body: expect.stringContaining('2026-10-13 (Мягмар) 15:00'),
      });
      expect(outcome.data).toMatchObject({ created: false, гараг: 'Мягмар' });
    });
  });
});
