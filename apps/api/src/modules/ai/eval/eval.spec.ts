import { describe, expect, it } from 'vitest';
import { runChecks, type CheckId, type EvalAnswer, type EvalQuestion } from './eval-checks.js';
import { renderReport, sampleQuestions, summarise, type EvalRecord } from './eval-report.js';

/**
 * 2G-02: the rules an answer is held to, and the sampling and report around
 * them. The rules are heuristics over Mongolian prose, so each test names the
 * real failure it was written for — the audit's, not an invented one.
 */
const question = (over: Partial<EvalQuestion> = {}): EvalQuestion => ({
  id: 'q1',
  text: 'Хэлний оноо шаардах уу?',
  topic: 'language',
  romanised: false,
  answeredBy: 'automation',
  ...over,
});

const answer = (text: string, over: Partial<EvalAnswer> = {}): EvalAnswer => ({
  text,
  grounded: true,
  tools: [],
  ...over,
});

const failed = (q: EvalQuestion, a: EvalAnswer): CheckId[] =>
  runChecks(q, a)
    .filter((check) => !check.pass)
    .map((check) => check.id);

describe('runChecks', () => {
  it('passes an answer that responds, asks one thing and leaves a step', () => {
    const good = answer(
      'GKS бакалаврт хэлний оноо шаардахгүй [K1]. Танд TOPIK эсвэл IELTS байгаа юу?',
    );

    expect(failed(question(), good)).toEqual([]);
  });

  it('fails the canned dead end the old automation ended every thread on', () => {
    expect(
      failed(
        question(),
        answer('Та түр хүлээнэ үү. Манай боловсролын мэргэжилтэн удахгүй холбогдоно.'),
      ),
    ).toContain('no_dead_end');
  });

  it('fails an answer that is only the assistant going offline', () => {
    const offline = answer('', { offline: 'AI туслах түр унтраалттай байна.' });

    expect(failed(question(), offline)).toContain('answered');
  });

  it.each(['Та заавал тэнцэнэ.', 'Виз 100% гарна.', 'Баталгаатай виз авна.'])(
    'fails the promise "%s"',
    (text) => {
      expect(failed(question(), answer(`${text} Цаг авах уу?`))).toContain('no_promise');
    },
  );

  it('does not mistake a scholarship that covers 100% of tuition for a visa promise', () => {
    expect(
      failed(question(), answer('Сургалтын төлбөр 100% тэтгэлэгтэй [K1]. Цаг авах уу?')),
    ).not.toContain('no_promise');
  });

  it('fails a sum of money with no citation, passes it with one', () => {
    const q = question({ topic: 'price' });

    expect(failed(q, answer('Урьдчилгаа 200,000 төгрөг. Цаг авах уу?'))).toContain(
      'no_uncited_money',
    );
    expect(failed(q, answer('Урьдчилгаа 200,000 төгрөг [T1]. Цаг авах уу?'))).not.toContain(
      'no_uncited_money',
    );
  });

  it('wants the reply to end on a question or something to do', () => {
    expect(failed(question(), answer('Хэлний оноо шаардахгүй [K1].'))).toContain('ends_with_step');
    expect(
      failed(question(), answer('Хэлний оноо шаардахгүй [K1]. Маргааш 14:00-д уулзах уу?')),
    ).not.toContain('ends_with_step');
  });

  it('counts leaving a number, or a numbered list of options, as a step', () => {
    expect(failed(question(), answer('Хэлний оноо шаардахгүй [K1]. Утасны дугаараа үлдээнэ үү.'))).not.toContain('ends_with_step');
    expect(failed(question(), answer('Танд аль нь ойр вэ\n1. Бакалавр\n2. Магистр'))).not.toContain('ends_with_step');
    expect(failed(question(), answer('Түвшнээ хэлбэл зөвлөхөд тусална.'))).not.toContain('ends_with_step');
  });

  it('fails two questions in one reply — the audit saw six', () => {
    expect(failed(question(), answer('Та аль түвшинд сурах вэ? Голч хэд вэ?'))).toContain(
      'one_ask',
    );
  });

  it('wants romanised Mongolian answered in Cyrillic', () => {
    const q = question({ text: 'Yonsei University ruu sonirhoj baigaa', romanised: true });

    expect(
      failed(q, answer('Yonsei is a good school. Do you want to book a visit? Let us know.')),
    ).toContain('cyrillic_reply');
    expect(
      failed(
        q,
        answer(
          'Ёнсэй их сургууль (Yonsei University) бакалаврын хөтөлбөртэй [T1]. Танд аль чиглэл ойр вэ?',
        ),
      ),
    ).not.toContain('cyrillic_reply');
  });

  it('fails a wall of text', () => {
    expect(failed(question(), answer(`${'Тайлбар. '.repeat(120)}Цаг авах уу?`))).toContain('short');
  });
});

describe('sampleQuestions', () => {
  const pool: EvalQuestion[] = Array.from({ length: 200 }, (_, i) =>
    question({
      id: `q${i}`,
      text: `Асуулт дугаар ${i} сургуулийн талаар`,
      topic: i % 2 ? 'visit' : 'price',
      romanised: i % 4 < 2,
    }),
  );

  it('takes a fixed number per topic and is repeatable', () => {
    const first = sampleQuestions(pool, 1, { visit: 10, price: 6 });
    const second = sampleQuestions(pool, 1, { visit: 10, price: 6 });

    expect(first.filter((q) => q.topic === 'visit')).toHaveLength(10);
    expect(first.filter((q) => q.topic === 'price')).toHaveLength(6);
    expect(first.map((q) => q.id)).toEqual(second.map((q) => q.id));
  });

  it('draws half of each topic from the Latin-letter questions', () => {
    const picked = sampleQuestions(pool, 1, { visit: 10 });

    expect(picked.filter((q) => q.romanised)).toHaveLength(5);
  });

  it('skips bare links and one-word messages', () => {
    const junk = [
      question({ id: 'l', text: 'https://frontierkorean.co.kr/kstudy/EN/index.html' }),
      question({ id: 's', text: 'hi' }),
    ];

    expect(sampleQuestions(junk, 1, { language: 5 })).toEqual([]);
  });
});

describe('summarise and renderReport', () => {
  const records: EvalRecord[] = [
    {
      question: question({ id: 'a' }),
      answer: answer('Хэлний оноо шаардахгүй [K1]. Цаг авах уу?', { tools: ['search_knowledge'] }),
      checks: [],
    },
    {
      question: question({ id: 'b', romanised: true, text: 'hezee burtguuleh ve' }),
      answer: answer('Түр хүлээнэ үү.', { grounded: false }),
      checks: [],
    },
  ].map((r) => ({ ...r, checks: runChecks(r.question, r.answer) }));

  it('counts a clean answer once and attributes the failure to its checks', () => {
    const summary = summarise(records);

    expect(summary.clean).toEqual({ pass: 1, total: 2 });
    expect(summary.byCheck.no_dead_end).toEqual({ pass: 1, total: 2 });
    expect(summary.romanised).toEqual({ pass: 0, total: 1 });
    expect(summary.ungrounded).toEqual({ pass: 1, total: 2 });
    expect(summary.tools).toEqual({ search_knowledge: 1 });
  });

  it('warns when the knowledge base was empty, so a wall of "I do not know" is not blamed on the prompt', () => {
    const report = renderReport(records, { when: '2026-10-09', knowledgeChunks: 0 });

    expect(report).toContain('Мэдлэгийн сан хоосон');
    expect(report).toContain('Бүх шалгуурыг давсан: 50% (1/2)');
    expect(report).toContain('hezee burtguuleh ve');
  });
});
