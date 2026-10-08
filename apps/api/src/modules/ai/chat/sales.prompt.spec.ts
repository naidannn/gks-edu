import { describe, expect, it } from 'vitest';
import { AccessLevel } from '../../../prisma/client.js';
import { buildSystemPrompt } from './prompt.builder.js';
import { officeStatus, salesPrompt } from './sales.prompt.js';

/**
 * The sales layer (2G-03).
 *
 * The wording is the office's to tune; what is pinned here is the behaviour the
 * 1,502-thread analysis asked for — who gets the layer, that it never offers an
 * hour the office is closed, and that it cannot be talked into the dead end the
 * old automation ended every conversation on.
 */

// 2026-10-09 is a Friday. Ulaanbaatar is UTC+8, so 10:00 there is 02:00Z.
const at = (iso: string) => new Date(iso);

describe('officeStatus', () => {
  it('is open on a weekday morning', () => {
    expect(officeStatus(at('2026-10-09T02:00:00Z'))).toContain('нээлттэй');
  });

  it('reads the Ulaanbaatar clock, not the server’s', () => {
    // 20:30 UTC Thursday is already 04:30 Friday in Ulaanbaatar — before opening.
    const status = officeStatus(at('2026-10-08T20:30:00Z'));

    expect(status).toContain('Баасан гараг, 04:30');
    expect(status).toContain('өнөөдөр 09:00-д нээгдэнэ');
  });

  it('opens later on Saturday than on a weekday', () => {
    expect(officeStatus(at('2026-10-10T02:00:00Z'))).toContain('өнөөдөр 11:00-д нээгдэнэ');
  });

  it('points at tomorrow once the day has closed', () => {
    // Friday 19:00 -> Saturday 11:00.
    expect(officeStatus(at('2026-10-09T11:00:00Z'))).toContain('маргааш 11:00-д');
  });

  it('skips the closed Sunday', () => {
    // Saturday 19:00 -> Sunday is closed, so Monday 09:00.
    expect(officeStatus(at('2026-10-10T11:00:00Z'))).toContain('Даваа гарагт 09:00-д');
    // And on Sunday itself, Monday is simply tomorrow.
    expect(officeStatus(at('2026-10-11T05:00:00Z'))).toContain('маргааш 09:00-д');
  });
});

describe('salesPrompt', () => {
  it.each([AccessLevel.PUBLIC, AccessLevel.REGISTERED])('applies to %s', (level) => {
    expect(salesPrompt(level)).toContain('Борлуулалтын зан төлөв');
  });

  it.each([AccessLevel.CONTRACTED, AccessLevel.INTERNAL])(
    'stays out of the way for %s',
    (level) => {
      expect(salesPrompt(level)).toBeNull();
    },
  );

  it('gives the office address and hours, and tonight’s status', () => {
    const text = salesPrompt(AccessLevel.PUBLIC, at('2026-10-09T02:00:00Z'))!;

    expect(text).toContain('Eco International Tower, 17 давхар, 1707 тоот');
    expect(text).toContain('Даваа–Баасан 09:00–18:00, Бямба 11:00–18:00');
    expect(text).toContain('нээлттэй');
  });

  it('forbids ending on the canned wait message', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    expect(text).toContain('"Түр хүлээнэ үү"');
    expect(text).toContain('бүү хаа');
  });

  it('answers first, then one step — never two questions', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    expect(text).toContain('Эхлээд асуултад нь хариул');
    expect(text).toContain('нэгийг л');
    expect(text).toContain('Хоёрыг хамт бүү тавь');
  });

  it('guides a visitor who knows nothing instead of quizzing them', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    // Real thread: "Бакалаврын мэдээлэл авах" got a school list, then "which city?".
    expect(text).toContain('юу ч мэдэхгүй');
    expect(text).toContain('сургуулийн жагсаалт бүү асга');
    // The ladder, in order: goal, field, city, only then named schools.
    const order = ['**Зорилго:**', '**Юунд дуртай:**', '**Хот:**', '**Нэр дэвшигчид:**'].map(
      (step) => text.indexOf(step),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('offers numbered choices and never repeats a question the visitor could not answer', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    expect(text).toContain('"2" гэж бичихэд л хангалттай');
    expect(text).toContain('ижил асуултыг давтахгүй');
  });

  it('keeps city comparisons to what the tools return', () => {
    expect(salesPrompt(AccessLevel.PUBLIC)).toContain('өөрийн таамаглал');
  });

  it('closes a hot lead with two concrete slots instead of a one-word yes', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    // Audit: 94 of 136 hot leads never got a time; the confirmation was "болноо".
    expect(text).toContain('ганц үгээр хариулж ярианыг бүү дуус');
    expect(text).toContain('хоёр тодорхой сонголт');
    expect(text).toContain('Лхагва 11:00 эсвэл Пүрэв 15:00');
  });

  it('keeps someone who is not eligible, or cannot come in, in the conversation', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    expect(text).toContain('өөрийн зардлаар сурах замыг');
    expect(text).toContain('оффисыг дахин бүү давт');
  });

  it('does not dodge a trust question and does not promise an outcome', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;

    expect(text).toContain('Итгэлийн асуулт');
    expect(text).toContain('виз 100%');
  });

  it('promises no callback time the system cannot keep', () => {
    // "30 минутад залгана" waits for the callback task (2G-14); until then the
    // prompt may only say when, never how fast.
    expect(salesPrompt(AccessLevel.PUBLIC)).not.toMatch(/30 минут/);
  });

  it('tells the model to answer romanised Mongolian in Cyrillic', () => {
    expect(salesPrompt(AccessLevel.PUBLIC)).toContain('кириллээр');
  });

  it('only names tools that exist', () => {
    const text = salesPrompt(AccessLevel.PUBLIC)!;
    const named = [...text.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]);

    // `book_visit` and `check_gks_eligibility` are planned (2G-05, 2B-07); naming a
    // tool the model is not given makes it call something that does not exist.
    expect(named).not.toContain('book_visit');
    expect(named).not.toContain('check_gks_eligibility');
  });
});

describe('inside the full prompt', () => {
  const build = (level: AccessLevel) =>
    buildSystemPrompt({ persona: 'Чи GKS EDU-ийн туслах.', level, hits: [] }).system;

  it('sits after the policy rules and before the sources', () => {
    const system = build(AccessLevel.PUBLIC);

    expect(system.indexOf('## Хатуу дүрэм')).toBeLessThan(
      system.indexOf('## Борлуулалтын зан төлөв'),
    );
    expect(system.indexOf('## Борлуулалтын зан төлөв')).toBeLessThan(
      system.indexOf('## Эх сурвалж'),
    );
  });

  it('is absent for a contracted client', () => {
    expect(build(AccessLevel.CONTRACTED)).not.toContain('Борлуулалтын зан төлөв');
  });
});

/**
 * Rules that live in two layers can contradict each other, and a model handed
 * contradicting rules picks one at random. These pin the four contradictions
 * found on 2026-10-09 so a later edit to either side fails here first.
 */
describe('layers that must agree', () => {
  const build = (
    capture: { turns: number; askAfter: number; contactSettled: boolean },
    channel?: 'FACEBOOK',
  ) =>
    buildSystemPrompt({
      persona: 'Чи GKS EDU-ийн туслах.',
      level: AccessLevel.PUBLIC,
      hits: [],
      toolNames: ['save_visitor_profile', 'create_consultation_request'],
      capture,
      ...(channel ? { channel: channel as never } : {}),
    }).system;

  it('has one length rule, in the policy, and no competing numbers', () => {
    const system = build({ turns: 4, askAfter: 3, contactSettled: false });

    expect(system).toContain('2-5 өгүүлбэр');
    expect(system).not.toContain('3-6 өгүүлбэр');
    expect(system).not.toContain('2–4 өгүүлбэр');
  });

  it('lets the sales layer steer with a choice before the capture threshold', () => {
    const system = build({ turns: 1, askAfter: 3, contactSettled: false });

    // The ban is on personal details, not on "bachelor or master?".
    expect(system).toContain('хувийн мэдээллийг');
    expect(system).toContain('чиглүүлэх сонголтын асуулт');
    expect(system).not.toContain('юу ч бүү асуу');
  });

  it('asks for one thing per turn once capture opens', () => {
    expect(build({ turns: 4, askAfter: 3, contactSettled: false })).toContain('нэг л хүсэлт');
  });

  it('does not ask for a phone number again while still confirming a visit', () => {
    const system = build({ turns: 6, askAfter: 3, contactSettled: true });

    expect(system).toContain('Дугаар дахин **бүү** асуу');
    expect(system).toContain('өгсөн дугаарыг нь ашиглаж');
    expect(system).toContain('аль хэдийн өгсөн бол дахин бүү асуу');
  });
});
