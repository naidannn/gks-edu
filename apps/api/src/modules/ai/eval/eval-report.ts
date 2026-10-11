import {
  CHECK_IDS,
  type CheckId,
  type CheckResult,
  type EvalAnswer,
  type EvalQuestion,
} from './eval-checks.js';
import { baseModel, costMicros, MODEL_PRICES_USD_PER_MTOK } from '../llm/llm.types.js';

/** How many real questions to replay from each topic (`AI-SALES-IMPROVEMENT.md` §5). */
export const TOPIC_QUOTA: Record<string, number> = {
  visit: 15,
  eligibility: 15,
  program: 15,
  deadline: 15,
  price: 15,
  language: 15,
  school: 6,
  other: 10,
};

/** A small deterministic generator, so a re-run asks the same questions and a prompt edit is the only variable. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffled<T>(items: T[], next: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Picks the questions to replay: a fixed number per topic, half of each topic
 * written in Latin letters (51% of real customers do), and nothing that is a
 * bare link or too short to be a question.
 */
export function sampleQuestions(
  all: EvalQuestion[],
  seed = 20261009,
  quota = TOPIC_QUOTA,
): EvalQuestion[] {
  const next = random(seed);
  const usable = all.filter(
    (q) => q.text.length >= 15 && q.text.length <= 300 && !/^https?:\S+$/.test(q.text.trim()),
  );
  const picked: EvalQuestion[] = [];

  for (const [topic, count] of Object.entries(quota)) {
    const inTopic = usable.filter((q) => q.topic === topic);
    const latin = shuffled(
      inTopic.filter((q) => q.romanised),
      next,
    );
    const cyrillic = shuffled(
      inTopic.filter((q) => !q.romanised),
      next,
    );
    const wantLatin = Math.min(latin.length, Math.ceil(count / 2));
    const chosen = [...latin.slice(0, wantLatin), ...cyrillic.slice(0, count - wantLatin)];
    // If one script ran short, top up from the other rather than under-sampling the topic.
    const rest = [...latin.slice(wantLatin), ...cyrillic.slice(count - wantLatin)];
    picked.push(...chosen, ...rest.slice(0, Math.max(0, count - chosen.length)));
  }

  return picked;
}

export interface EvalUsage {
  /** Model calls the turn made: one per tool round, plus any retry. */
  calls: number;
  promptTokens: number;
  /** Part of `promptTokens` served from the provider's prompt cache. */
  cachedPromptTokens: number;
  /** Billed output, thinking included. */
  completionTokens: number;
  reasoningTokens: number;
}

export interface EvalRecord {
  question: EvalQuestion;
  answer: EvalAnswer;
  checks: CheckResult[];
  /** Absent on runs made before 2026-10-11. */
  model?: string;
  usage?: EvalUsage;
  latencyMs?: number;
}

/**
 * What the usage would cost, in USD, at the peak rate and at the off-peak one.
 * DeepSeek charges double during its peak hours — 01-04 and 06-10 UTC on
 * weekdays, which is 09-12 and 14-18 in Ulaanbaatar, the office's busiest time —
 * so the report shows both. The prices are the app's own (`llm.types.ts`).
 */
export function usageCost(model: string, usage: EvalUsage): { peak: number; offPeak: number } | null {
  if (!MODEL_PRICES_USD_PER_MTOK[baseModel(model)]) return null;
  const peak =
    costMicros(model, usage.promptTokens, usage.completionTokens, usage.cachedPromptTokens) / 1_000_000;
  return { peak, offPeak: model.startsWith('deepseek-') ? peak / 2 : peak };
}

/** The cost-and-speed section appended to a run's report. */
export function renderUsage(records: EvalRecord[], model: string): string {
  const measured = records.filter((record) => record.usage);
  if (measured.length === 0) return '';
  const sum = (pick: (usage: EvalUsage) => number) =>
    measured.reduce((total, record) => total + pick(record.usage!), 0);
  const total: EvalUsage = {
    calls: sum((u) => u.calls),
    promptTokens: sum((u) => u.promptTokens),
    cachedPromptTokens: sum((u) => u.cachedPromptTokens),
    completionTokens: sum((u) => u.completionTokens),
    reasoningTokens: sum((u) => u.reasoningTokens),
  };
  const cost = usageCost(model, total);
  const latencies = measured.map((record) => record.latencyMs ?? 0).sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length / 2)] ?? 0;
  const p90 = latencies[Math.floor(latencies.length * 0.9)] ?? 0;
  const per = (n: number) => Math.round(n / measured.length);
  const cachedShare = total.promptTokens ? Math.round((total.cachedPromptTokens / total.promptTokens) * 100) : 0;

  return [
    '## Зардал ба хурд',
    '',
    '| | Нийт | Нэг хариултад |',
    '| --- | --- | --- |',
    `| Моделийн дуудлага | ${total.calls} | ${(total.calls / measured.length).toFixed(1)} |`,
    `| Оролтын token | ${total.promptTokens} | ${per(total.promptTokens)} |`,
    `| …үүнээс cache | ${total.cachedPromptTokens} (${cachedShare}%) | ${per(total.cachedPromptTokens)} |`,
    `| Гаралтын token (thinking орсон) | ${total.completionTokens} | ${per(total.completionTokens)} |`,
    `| …үүнээс thinking | ${total.reasoningTokens} | ${per(total.reasoningTokens)} |`,
    cost
      ? `| Зардал, USD (оргил / оргил бус) | ${cost.peak.toFixed(4)} / ${cost.offPeak.toFixed(4)} | ${(cost.peak / measured.length).toFixed(5)} / ${(cost.offPeak / measured.length).toFixed(5)} |`
      : '| Зардал | үнэ тодорхойгүй модель | |',
    `| Хугацаа, мс (медиан / p90) | | ${median} / ${p90} |`,
    '',
  ].join('\n');
}

export interface Rate {
  pass: number;
  total: number;
}

export interface EvalSummary {
  total: number;
  /** Share of answers that passed every check — the one number to watch across prompt edits. */
  clean: Rate;
  byCheck: Record<CheckId, Rate>;
  byTopic: Record<string, Rate>;
  romanised: Rate;
  tools: Record<string, number>;
  /** Share of answers the orchestrator itself marked ungrounded. */
  ungrounded: Rate;
}

const rate = (pass: number, total: number): Rate => ({ pass, total });

export function summarise(records: EvalRecord[]): EvalSummary {
  const byCheck = Object.fromEntries(CHECK_IDS.map((id) => [id, rate(0, 0)])) as Record<
    CheckId,
    Rate
  >;
  const byTopic: Record<string, Rate> = {};
  const tools: Record<string, number> = {};
  let clean = 0;
  let romanisedClean = 0;
  let romanisedTotal = 0;
  let ungrounded = 0;

  for (const record of records) {
    const allPass = record.checks.every((check) => check.pass);
    if (allPass) clean += 1;

    for (const check of record.checks) {
      byCheck[check.id].total += 1;
      if (check.pass) byCheck[check.id].pass += 1;
    }

    const topic = (byTopic[record.question.topic] ??= rate(0, 0));
    topic.total += 1;
    if (allPass) topic.pass += 1;

    if (record.question.romanised) {
      romanisedTotal += 1;
      if (allPass) romanisedClean += 1;
    }

    if (record.answer.grounded === false) ungrounded += 1;
    for (const tool of new Set(record.answer.tools)) tools[tool] = (tools[tool] ?? 0) + 1;
  }

  return {
    total: records.length,
    clean: rate(clean, records.length),
    byCheck,
    byTopic,
    romanised: rate(romanisedClean, romanisedTotal),
    tools,
    ungrounded: rate(ungrounded, records.length),
  };
}

const pct = (r: Rate) =>
  r.total === 0 ? '—' : `${Math.round((100 * r.pass) / r.total)}% (${r.pass}/${r.total})`;

/** The report a person reads: the numbers, then the failures, then answers beside what the office actually said. */
export function renderReport(
  records: EvalRecord[],
  meta: { when: string; model?: string; knowledgeChunks?: number },
): string {
  const summary = summarise(records);
  const lines: string[] = [
    '# AI туслахын eval',
    '',
    `${meta.when} · ${summary.total} бодит асуулт${meta.model ? ` · ${meta.model}` : ''}${
      meta.knowledgeChunks !== undefined
        ? ` · мэдлэгийн сангийн chunk: ${meta.knowledgeChunks}`
        : ''
    }`,
    '',
    meta.knowledgeChunks === 0
      ? '> **Мэдлэгийн сан хоосон.** Хариулт зөвхөн tool-оос ирсэн; "мэдэхгүй" хариулт ихэссэн нь контентын цоорхой, prompt-ын биш.\n'
      : '',
    `**Бүх шалгуурыг давсан: ${pct(summary.clean)}** · латин асуултад: ${pct(summary.romanised)} · ungrounded: ${pct(summary.ungrounded)}`,
    '',
    '## Шалгуур тус бүр',
    '',
    '| Шалгуур | Давсан |',
    '| --- | --- |',
    ...CHECK_IDS.map((id) => `| ${id} | ${pct(summary.byCheck[id])} |`),
    '',
    '## Сэдэв тус бүр (бүх шалгуурыг давсан)',
    '',
    '| Сэдэв | Давсан |',
    '| --- | --- |',
    ...Object.entries(summary.byTopic).map(([topic, r]) => `| ${topic} | ${pct(r)} |`),
    '',
    '## Дуудсан tool-ууд',
    '',
    Object.entries(summary.tools)
      .sort((a, b) => b[1] - a[1])
      .map(([tool, n]) => `${tool}: ${n}`)
      .join(' · ') || '(нэг ч үгүй)',
    '',
    '## Унасан хариултууд',
    '',
  ];

  for (const record of records.filter((r) => r.checks.some((c) => !c.pass))) {
    lines.push(
      `### ${record.question.topic}${record.question.romanised ? ' · латин' : ''} — ${record.question.text}`,
    );
    lines.push('');
    lines.push(
      `Унасан: ${record.checks
        .filter((c) => !c.pass)
        .map((c) => `${c.id}${c.evidence ? ` («${c.evidence}»)` : ''}`)
        .join('; ')}`,
    );
    lines.push('');
    lines.push(`AI: ${record.answer.text.replace(/\s+/g, ' ').slice(0, 600) || '(хоосон)'}`);
    lines.push('');
  }

  lines.push('## Ажилтны хариутай зэрэгцүүлсэн түүвэр', '');
  for (const record of records
    .filter((r) => r.question.answeredBy === 'staff' && r.question.staffReply)
    .slice(0, 20)) {
    lines.push(`**${record.question.text}**`, '');
    lines.push(`- Ажилтан: ${record.question.staffReply!.replace(/\s+/g, ' ').slice(0, 300)}`);
    lines.push(`- AI: ${record.answer.text.replace(/\s+/g, ' ').slice(0, 300) || '(хоосон)'}`, '');
  }

  return lines.filter((line) => line !== undefined).join('\n');
}
