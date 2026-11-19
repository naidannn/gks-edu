#!/usr/bin/env node
// Post a short, client-facing release note to Slack #release-notes after a
// deploy. deploy.sh runs it; it can also be run by hand:
//
//   node deploy/release-note.mjs --since <commit>   # what deploy.sh does
//   node deploy/release-note.mjs --dry              # print, do not post
//
// The commits since the last deployed one are rewritten by Claude into a few
// plain Mongolian lines a client would understand — commit subjects are
// English and technical, and nobody outside the team reads those. Changes
// nobody outside the team would notice are left out; if nothing is left, the
// script posts nothing and says so.
//
// Exit codes: 0 posted (or printed with --dry), 3 nothing worth telling
// clients, 1 failure. deploy.sh moves its DEPLOYED_COMMIT marker on 0 and 3,
// so a failed note is retried with the next deploy instead of being lost.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL = 'release-notes';
const MODEL = 'claude-sonnet-5-5';
const MAX_LOG_CHARS = 30_000;
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(REPO, 'deploy/.env.production');

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const sinceIndex = args.indexOf('--since');
const since = sinceIndex >= 0 ? (args[sinceIndex + 1] ?? '').trim() : '';

const SYSTEM = `Чи GKSedu.mn (Солонгост суралцах зуучлалын үйлчилгээ) платформын шинэчлэлийн мэдээг бичдэг.
Уншигч нь манай харилцагчид болон оффисын ажилтнууд — программист биш.

Танд git commit-уудын жагсаалт (англиар, техникийн) өгнө. Үүнээс:
- Хэрэглэгч, харилцагч эсвэл ажилтан анзаарах өөрчлөлтийг л сонго. Дотоод засвар, тест, рефактор, баримт бичиг, тохиргоо, сервер, мониторинг зэргийг орхи.
- Ойролцоо өөрчлөлтүүдийг нэг мөрөнд нэгтгэ. Хамгийн ихдээ 5 мөр.
- Мөр бүр нэг богино өгүүлбэр (12 орчим үг, нарийн ширийн зүйлгүй), монгол кирилл үсгээр, энгийн ярианы хэлээр, "юу сайжирсан / юу хийж болдог болсон"-ыг хэрэглэгчийн талаас нь хэл.
- Техникийн үг (API, commit, bug, model, database, endpoint, deploy, cache, Slack г.м.), хувилбарын дугаар, файлын нэр, хүний нэр бүү ашигла.
- Үнэн бус зүйл бүү нэм, амлалт бүү өг, commit-д байхгүй зүйл бүү зохио.
- Эхэнд нь тохирох нэг emoji тавьж болно.

Зөвхөн JSON хэлбэрээр хариул: {"items": ["...", "..."]}. Хэрэглэгчид хамаатай өөрчлөлт огт байхгүй бол {"items": []}.`;

function readEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function git(...gitArgs) {
  return execFileSync('git', ['-C', REPO, ...gitArgs], { encoding: 'utf8' }).trim();
}

function commitLog() {
  const known = since && (() => {
    try {
      git('cat-file', '-e', `${since}^{commit}`);
      return true;
    } catch {
      return false;
    }
  })();
  // No marker yet (first run) or a commit this clone does not have: fall back
  // to the last day rather than announcing the whole history.
  const range = known ? [`${since}..HEAD`] : ['--since=24.hours', 'HEAD'];
  const log = git('log', '--no-merges', '--format=### %s%n%b', ...range);
  return log
    .split('\n')
    .filter((line) => !/^(Co-Authored-By|Signed-off-by):/i.test(line))
    .join('\n')
    .slice(0, MAX_LOG_CHARS);
}

async function summarise(log, env) {
  const baseUrl = (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: log }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Claude HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const reply = await response.json();
  const text = (reply.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const items = JSON.parse(json).items;
  if (!Array.isArray(items)) throw new Error(`unexpected reply: ${text.slice(0, 300)}`);
  return items.map((item) => String(item).trim()).filter(Boolean);
}

// Form-encoded: Slack's read methods ignore a JSON body's arguments.
async function slack(token, method, params) {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json();
  if (!result.ok) throw new Error(`Slack ${method}: ${result.error}`);
  return result;
}

async function channelId(token) {
  let cursor = '';
  do {
    const page = await slack(token, 'conversations.list', {
      types: 'public_channel',
      exclude_archived: 'true',
      limit: '1000',
      ...(cursor ? { cursor } : {}),
    });
    const channel = page.channels.find((c) => c.name === CHANNEL);
    if (channel) {
      if (!channel.is_member) await slack(token, 'conversations.join', { channel: channel.id });
      return channel.id;
    }
    cursor = page.response_metadata?.next_cursor ?? '';
  } while (cursor);
  return (await slack(token, 'conversations.create', { name: CHANNEL })).channel.id;
}

function escapeMrkdwn(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function main() {
  const env = readEnv(ENV_FILE);
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in deploy/.env.production');
  if (!dry && !env.SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN is not set in deploy/.env.production');

  const log = commitLog();
  if (!log) {
    console.log('No new commits since the last deploy — nothing to announce.');
    return 3;
  }

  const items = await summarise(log, env);
  if (items.length === 0) {
    console.log('Nothing client-facing in these commits — no release note posted.');
    return 3;
  }

  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format(new Date());
  const title = '🚀 gksedu.mn шинэчлэгдлээ';
  const body = [`*${title}* · ${date}`, '', ...items.map((item) => `• ${escapeMrkdwn(item)}`)].join('\n');

  if (dry) {
    console.log(body);
    return 0;
  }

  await slack(env.SLACK_BOT_TOKEN, 'chat.postMessage', {
    channel: await channelId(env.SLACK_BOT_TOKEN),
    text: title,
    blocks: JSON.stringify([{ type: 'section', text: { type: 'mrkdwn', text: body } }]),
  });
  console.log(`Release note posted to #${CHANNEL} (${items.length} line${items.length === 1 ? '' : 's'}).`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Release note failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);
