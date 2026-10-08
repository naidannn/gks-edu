#!/usr/bin/env node
// Turns a Facebook "Download your information" export of the page inbox into an
// anonymised conversation corpus for evaluating the AI assistant.
//
//   node scripts/facebook-chats-import.mjs <export-dir> [--out data/chat-corpus]
//
// Facebook writes UTF-8 text as latin-1 escapes, so every string is re-decoded.
// Personal data is removed before anything is written: customer names become
// "Customer", phones / e-mails / URLs are masked, and thread ids are hashed.
// The output directory is gitignored; the raw export never enters the repo.

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const exportDir = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : 'data/chat-corpus');
const PAGE_NAME = 'GKS Edu Mongolia';
const AUTOMATION_MIN_REPEATS = 8; // a page message sent this often is a template

if (!exportDir) {
  console.error('usage: node scripts/facebook-chats-import.mjs <export-dir> [--out dir]');
  process.exit(1);
}

const fix = (s) => (typeof s === 'string' ? Buffer.from(s, 'latin1').toString('utf8') : s);

function mask(text) {
  return text
    .replace(/https?:\/\/(?:www\.)?(?:facebook|fb|m\.me|messenger)[^\s]*/gi, '[fb-link]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(?<![\d])(?:\+?976[\s-]?)?[3-9]\d{3}[\s-]?\d{4}(?![\d])/g, '[phone]')
    .replace(/\b[А-ЯӨҮЁA-Z]{2}\s?\d{8}\b/g, '[register-no]');
}

function findInbox(dir) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = join(d, e.name);
      if (e.name === 'inbox' && p.includes('messages')) return p;
      stack.push(p);
    }
  }
  throw new Error('messages/inbox not found under ' + dir);
}

const inbox = findInbox(resolve(exportDir));
const raw = [];
for (const entry of readdirSync(inbox, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const name = entry.name;
  const files = readdirSync(join(inbox, name)).filter((f) => /^message_\d+\.json$/.test(f));
  let messages = [];
  let title = '';
  for (const f of files) {
    const d = JSON.parse(readFileSync(join(inbox, name, f), 'utf8'));
    title = fix(d.title ?? title);
    messages = messages.concat(d.messages);
  }
  messages.sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  raw.push({ id: name, title, messages });
}

// Which page messages are templates? Count identical text across all threads.
const pageText = new Map();
for (const t of raw) {
  for (const m of t.messages) {
    if (fix(m.sender_name) !== PAGE_NAME || !m.content) continue;
    const k = fix(m.content).trim();
    pageText.set(k, (pageText.get(k) ?? 0) + 1);
  }
}

const threads = raw
  .map((t) => {
    const messages = t.messages
      .filter((m) => m.content)
      .map((m) => {
        const isPage = fix(m.sender_name) === PAGE_NAME;
        const text = fix(m.content).trim();
        return {
          from: isPage
            ? (pageText.get(text) ?? 0) >= AUTOMATION_MIN_REPEATS
              ? 'automation'
              : 'staff'
            : 'customer',
          ts: m.timestamp_ms,
          text: mask(text),
        };
      });
    return {
      id: createHash('sha256').update(t.id).digest('hex').slice(0, 12),
      messages,
    };
  })
  .filter((t) => t.messages.length > 0);

mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'threads.jsonl'),
  threads.map((t) => JSON.stringify(t)).join('\n') + '\n',
);

const templates = [...pageText.entries()]
  .filter(([, n]) => n >= AUTOMATION_MIN_REPEATS)
  .sort((a, b) => b[1] - a[1])
  .map(([text, n]) => ({ n, text: mask(text) }));
writeFileSync(join(outDir, 'automation-templates.json'), JSON.stringify(templates, null, 2));

// Real customer questions, ready to replay against the assistant. Button taps
// ("Бакалаврын мэдээлэл авах") are menu choices, not questions — dropped.
const BUTTONS = new Set([
  'бакалаврын мэдээлэл авах',
  'засгын газрын тэтгэлэг',
  'магистр, докторын мэдээлэл авах',
  'хэлний бэлтгэл, үндсэн анги',
  'хаяг холбоо барих',
  'хаяг, цагийн хуваарь',
  'is anyone available to chat?',
  'is this product available?',
]);
const TOPICS = [
  [
    'eligibility',
    /нас(тай|ны)?\b|голч|оноо|шаардлага|шалгуур|тэнц|nas\b|golch|shalguur|onoo|tenc/i,
  ],
  ['deadline', /хэзээ|бүртгэл|сард|хугацаа|hezee|burtgel|sard\b|hugatsaa/i],
  ['price', /төлбөр|үнэ|хэдэн (төгрөг|сая)|tulbur|une\b|hed(en)? (tugrug|saya)/i],
  ['visit', /очиж|уулз|өнөөдөр|хаяг|цаг(ийн)?\b|ochij|uulz|onoodr|hayg|tsag/i],
  ['language', /хэл(ний)?\b|topik|ielts|helnii|hel\b/i],
  [
    'program',
    /мэргэжил|чиглэл|хөтөлбөр|mergejil|chigleleer|hutulbur|анагаах|инженер|дизайн|бизнес|IT\b/i,
  ],
  ['school', /их сургууль|univers|yonsei|korea|seoul|когеа|ёнсэй/i],
];
const topicOf = (text) => TOPICS.find(([, re]) => re.test(text))?.[0] ?? 'other';
const isLatin = (s) =>
  (s.match(/[A-Za-z]/g)?.length ?? 0) > (s.match(/[А-Яа-яӨөҮүЁё]/g)?.length ?? 0);

const seenQ = new Set();
const questions = [];
for (const t of threads) {
  t.messages.forEach((m, i) => {
    const key = m.text.toLowerCase().replace(/\s+/g, ' ');
    if (
      m.from !== 'customer' ||
      m.text.length < 12 ||
      BUTTONS.has(key) ||
      /\[(phone|email|fb-link)\]/.test(m.text) ||
      seenQ.has(key)
    )
      return;
    seenQ.add(key);
    const next = t.messages.slice(i + 1).find((n) => n.from !== 'customer');
    questions.push({
      thread: t.id,
      text: m.text,
      topic: topicOf(m.text),
      romanised: isLatin(m.text),
      // What the office actually did with it — the baseline the assistant must beat.
      answeredBy: next ? next.from : 'nobody',
      staffReply: next?.from === 'staff' ? next.text : undefined,
    });
  });
}
writeFileSync(
  join(outDir, 'eval-questions.jsonl'),
  questions.map((q) => JSON.stringify(q)).join('\n') + '\n',
);

console.log(
  `questions=${questions.length} threads=${threads.length} messages=${threads.reduce((n, t) => n + t.messages.length, 0)} templates=${templates.length} -> ${outDir}`,
);
