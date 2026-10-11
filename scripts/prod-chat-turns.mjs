#!/usr/bin/env node
/**
 * Turns an export of production `facebook_messages` into eval turns: every
 * answer the assistant gave on Messenger becomes the question it answered plus
 * the conversation before it, built exactly the way
 * `FacebookAssistantService.history` builds it — the last 12 sent messages,
 * staff and AI both on the assistant side, consecutive lines from one side
 * joined. Replaying a turn with that history is what makes "Тийм" or a bare
 * phone number a question that can be answered at all.
 *
 *   node scripts/prod-chat-turns.mjs data/chat-corpus/prod/facebook-messages.jsonl [--per-thread 1] [--limit 120]
 *
 * Writes `data/chat-corpus/prod/turns.jsonl` (gitignored — customer text).
 * The export is one JSON object per line: { thread, sender, text, status, at }.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const input = args.find((arg) => !arg.startsWith('--') && !/^\d+$/.test(arg));
if (!input) {
  console.error('usage: node scripts/prod-chat-turns.mjs <facebook-messages.jsonl> [--per-thread 1] [--limit 120]');
  process.exit(1);
}
const perThread = Number(flag('per-thread', 1));
const limit = Number(flag('limit', 120));

const HISTORY_MESSAGES = 12;

// The same topic rules as `facebook-chats-import.mjs`, so the two corpora read alike.
const TOPICS = [
  ['eligibility', /нас(тай|ны)?\b|голч|оноо|шаардлага|шалгуур|тэнц|nas\b|golch|shalguur|onoo|tenc/i],
  ['deadline', /хэзээ|бүртгэл|сард|хугацаа|hezee|burtgel|sard\b|hugatsaa/i],
  ['price', /төлбөр|үнэ|хэдэн (төгрөг|сая)|tulbur|une\b|hed(en)? (tugrug|saya)/i],
  ['visit', /очиж|уулз|өнөөдөр|хаяг|цаг(ийн)?\b|ochij|uulz|onoodr|hayg|tsag/i],
  ['language', /хэл(ний)?\b|topik|ielts|helnii|hel\b/i],
  ['program', /мэргэжил|чиглэл|хөтөлбөр|mergejil|chigleleer|hutulbur|анагаах|инженер|дизайн|бизнес|IT\b/i],
  ['school', /их сургууль|univers|yonsei|korea|seoul|когеа|ёнсэй/i],
];
const topicOf = (text) => TOPICS.find(([, re]) => re.test(text))?.[0] ?? 'other';
const isLatin = (s) => (s.match(/[A-Za-z]/g)?.length ?? 0) > (s.match(/[А-Яа-яӨөҮүЁё]/g)?.length ?? 0);

const rows = readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const byThread = new Map();
for (const row of rows) {
  if (!byThread.has(row.thread)) byThread.set(row.thread, []);
  byThread.get(row.thread).push(row);
}

function historyBefore(messages, index) {
  const sent = messages.slice(0, index).filter((m) => m.status === 'SENT' && m.text?.trim());
  const turns = [];
  for (const row of sent.slice(-HISTORY_MESSAGES)) {
    const role = row.sender === 'CONTACT' ? 'user' : 'assistant';
    const content = row.text.trim();
    const last = turns.at(-1);
    if (last && last.role === role) last.content = `${last.content}\n${content}`;
    else turns.push({ role, content });
  }
  while (turns[0]?.role === 'assistant') turns.shift();
  return turns;
}

/** A small deterministic generator, so a re-run picks the same turns. */
let state = 20261011;
const random = () => {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  return state / 0x100000000;
};
const shuffled = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const candidates = [];
for (const [thread, messages] of byThread) {
  messages.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const turns = [];
  messages.forEach((message, index) => {
    if (message.sender !== 'AI' || message.status !== 'SENT' || !message.text?.trim()) return;
    // The contact's lines since anything else was said: what this answer answered.
    let start = index;
    while (start > 0 && messages[start - 1].sender === 'CONTACT') start -= 1;
    const pending = messages.slice(start, index).filter((m) => m.text?.trim());
    if (pending.length === 0) return;
    const question = pending.map((m) => m.text.trim()).join('\n');
    const history = historyBefore(messages, start);
    turns.push({
      id: `${thread}-${index}`,
      thread,
      text: question,
      topic: topicOf(question),
      romanised: isLatin(question),
      answeredBy: 'ai',
      at: message.at,
      history,
      prodAnswer: message.text.trim(),
    });
  });
  candidates.push(...shuffled(turns).slice(0, perThread));
}

const picked = shuffled(candidates).slice(0, limit);
const output = resolve(dirname(input), 'turns.jsonl');
writeFileSync(output, picked.map((turn) => JSON.stringify(turn)).join('\n') + '\n');

const topics = {};
for (const turn of picked) topics[turn.topic] = (topics[turn.topic] ?? 0) + 1;
console.log(
  `${byThread.size} threads, ${candidates.length} candidate turns → ${picked.length} written to ${output}`,
);
console.log(
  `with history: ${picked.filter((t) => t.history.length > 0).length} · latin: ${picked.filter((t) => t.romanised).length} · topics: ${JSON.stringify(topics)}`,
);
