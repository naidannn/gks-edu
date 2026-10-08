import { describe, expect, it } from 'vitest';
import type { AiChatCard, AiChatSessionSummary } from '@gks/shared';
import { aiNextSteps, groupChatHistory, parseChatToken, startCaseLink } from '../app/utils/ai-chat';

const school = {
  slug: 'ajou-university',
  nameMn: 'Ажу их сургууль',
  nameEn: 'Ajou University',
  nameKo: '아주대학교',
  cityMn: 'Сувон',
  regionMn: 'Гёнгиг',
  logoPath: null,
  accreditation: 'EXCELLENT' as const,
  theKoreaRank: 21,
  isGksEligible: true,
  acceptsLanguagePrep: true,
};

const universityCard: AiChatCard = { type: 'university', data: { ...school, url: '/universities/ajou-university' } };
const pricingCard: AiChatCard = {
  type: 'pricing',
  data: {
    serviceType: 'BACHELOR',
    totalAmount: 5_000_000,
    prepaymentAmount: 1_500_000,
    balanceAmount: 3_500_000,
    balanceTrigger: 'AFTER_VISA_APPROVED',
  },
};

describe('aiNextSteps', () => {
  it('after a school, offers its programmes, its deadline and the contract for it', () => {
    const steps = aiNextSteps([universityCard], { signedIn: false });

    expect(steps.map((step) => step.label)).toEqual(['Хөтөлбөр, төлбөр', 'Элсэлтийн хугацаа', 'Гэрээ байгуулах']);
    // The question names the school: a chip that sends "its programmes" is a
    // question the model has to guess the subject of.
    const [programmes] = steps;
    expect(programmes!.kind === 'ask' && programmes!.prompt).toContain('Ажу их сургууль');
    expect(steps[2]).toMatchObject({ kind: 'link', to: '/app/start?university=ajou-university', primary: true });
  });

  it('after a list of schools, offers the first two by name as the answer to "which one?"', () => {
    const list: AiChatCard = {
      type: 'universities',
      data: {
        items: [school, { ...school, slug: 'snu', nameMn: 'Сөүлийн үндэсний их сургууль' }, { ...school, slug: 'ku', nameMn: 'Корё' }],
        total: 3,
        searchUrl: '/universities?region=Seoul',
      },
    };

    const steps = aiNextSteps([list], { signedIn: false });

    expect(steps.map((step) => step.label)).toEqual([
      'Ажу их сургууль',
      'Сөүлийн үндэсний их сургууль',
      'Харьцуулах',
      'Зөвлөгөө авах',
    ]);
  });

  it('lets the last card lead, so a price after a school ends on the contract for that service', () => {
    const steps = aiNextSteps([universityCard, pricingCard], { signedIn: true });

    expect(steps.at(-1)).toMatchObject({ kind: 'link', to: '/app/start?service=BACHELOR' });
  });

  it('gives an answer with no card a way forward too, and a person to reach', () => {
    const guest = aiNextSteps([], { signedIn: false });
    const member = aiNextSteps([], { signedIn: true });

    expect(guest.length).toBeGreaterThan(1);
    expect(guest.at(-1)).toMatchObject({ kind: 'link', to: '/consultation' });
    expect(member.at(-1)).toMatchObject({ kind: 'link', to: '/messages' });
  });

  it('does not offer a question the visitor has already asked', () => {
    const steps = aiNextSteps([], { signedIn: false }, ['Танай зуучлалын үйлчилгээний үнэ хэд вэ?']);

    expect(steps.map((step) => step.label)).not.toContain('Үйлчилгээний үнэ');
  });

  it('never offers more than one way out of the chat under one answer', () => {
    for (const cards of [[universityCard], [pricingCard], [], [{ type: 'fx', data: { rate: 2.5, date: '2026-10-09', source: 'Монголбанк' } } as AiChatCard]]) {
      const links = aiNextSteps(cards, { signedIn: false }).filter((step) => step.kind === 'link');
      expect(links.length).toBeLessThanOrEqual(1);
    }
  });

  it('only names one school in the start link when every round belongs to it', () => {
    const intake = (slug: string) => ({
      id: `i-${slug}`,
      university: { slug, nameMn: slug, logoPath: null },
      level: 'BACHELOR' as const,
      year: 2027,
      month: 3,
      internalDeadline: '2026-11-01T23:59:59Z',
      daysUntilInternalDeadline: 23,
      classStartDate: null,
    });

    const one = aiNextSteps([{ type: 'intakes', data: { items: [intake('a'), intake('a')], total: 2 } }], { signedIn: true });
    const two = aiNextSteps([{ type: 'intakes', data: { items: [intake('a'), intake('b')], total: 2 } }], { signedIn: true });

    expect(one.at(-1)).toMatchObject({ to: '/app/start?university=a' });
    expect(two.at(-1)).toMatchObject({ to: '/app/start' });
  });
});

describe('startCaseLink', () => {
  it('carries only what was settled', () => {
    expect(startCaseLink()).toBe('/app/start');
    expect(startCaseLink({ university: 'snu', intakeId: 'x1' })).toBe('/app/start?university=snu&intakeId=x1');
  });
});

describe('groupChatHistory', () => {
  const row = (id: string, at: Date): AiChatSessionSummary => ({
    sessionId: id,
    status: 'ACTIVE',
    title: id,
    lastMessageAt: at.toISOString(),
  });

  it('buckets by the viewer’s own days and drops the empty buckets', () => {
    const now = new Date(2026, 9, 9, 10, 0);
    const groups = groupChatHistory(
      [
        row('today', new Date(2026, 9, 9, 0, 5)),
        row('yesterday', new Date(2026, 9, 8, 23, 50)),
        row('week', new Date(2026, 9, 4, 12, 0)),
        row('old', new Date(2026, 5, 1)),
      ],
      now,
    );

    expect(groups.map((group) => [group.label, group.items.map((item) => item.sessionId)])).toEqual([
      ['Өнөөдөр', ['today']],
      ['Өчигдөр', ['yesterday']],
      ['Сүүлийн 7 хоног', ['week']],
      ['Өмнө нь', ['old']],
    ]);
  });
});

describe('parseChatToken', () => {
  it('reads the session and expiry the server signed, and nothing it did not', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const b64 = btoa(id).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    expect(parseChatToken(`ai_${b64}.1790000000000.sig`)).toEqual({ sessionId: id, expiresAt: 1790000000000 });
    expect(parseChatToken('Bearer something')).toBeNull();
    expect(parseChatToken('ai_')).toBeNull();
  });
});
