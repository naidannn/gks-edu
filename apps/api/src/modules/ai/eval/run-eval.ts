/**
 * Replays real customer questions through the assistant and grades the answers
 * (2G-02, `docs/AI-SALES-IMPROVEMENT.md` §5).
 *
 *   EVAL_DATABASE_URL=postgresql://…@localhost:5432/gks_edu pnpm --filter @gks/api ai:eval
 *   … ai:eval --limit 10          # smoke test
 *   … ai:eval --topic visit       # one topic only
 *
 * Questions come from `data/chat-corpus/eval-questions.jsonl`
 * (`scripts/facebook-chats-import.mjs`); the report lands beside it, gitignored.
 *
 * It writes chat sessions and calls the model, so it refuses to run against
 * anything but a database on this machine, and it blanks every credential that
 * could send something to a real person (Slack, Meta CAPI, storage). It boots
 * only the AI module — not the whole app — so no scheduled sweep or e-mail
 * queue wakes up against a database full of real client rows.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config as loadEnv } from 'dotenv';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuration } from '../../../config/configuration.js';
import { validateEnv } from '../../../config/env.validation.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AccessLevel, ChatChannel } from '../../../prisma/client.js';
import { QueueModule } from '../../../queue/queue.module.js';
import { RedisModule } from '../../../redis/redis.module.js';
import { StorageModule } from '../../../storage/storage.module.js';
import { AuditModule } from '../../audit/audit.module.js';
import { MetaModule } from '../../meta/meta.module.js';
import { AiConfigService } from '../ai-config.service.js';
import { AiModule } from '../ai.module.js';
import { ChatSessionService } from '../chat/chat-session.service.js';
import { TurnOrchestrator } from '../chat/turn.orchestrator.js';
import { runChecks, type EvalQuestion } from './eval-checks.js';
import { renderReport, sampleQuestions, type EvalRecord } from './eval-report.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

// Re-grade a finished run with the current rules, without asking the model again:
//   node dist/modules/ai/eval/run-eval.js --from data/chat-corpus/eval/<stamp>.json
const regrade = flag('from');
if (regrade) {
  const saved = JSON.parse(readFileSync(resolve(regrade), 'utf8')) as Record_[];
  const records = saved.map((record) => ({
    ...record,
    checks: runChecks(record.question, record.answer),
  }));
  const report = renderReport(records, { when: `${new Date().toISOString()} (дахин үнэлсэн)` });
  writeFileSync(resolve(regrade.replace(/\.json$/, '.regraded.md')), report);
  console.log(report.split('\n').slice(0, 42).join('\n'));
  process.exit(0);
}

const target = process.env.EVAL_DATABASE_URL;
if (!target) {
  console.error(
    'Set EVAL_DATABASE_URL to a database on this machine (the docker one). Refusing to guess.',
  );
  process.exit(1);
}
const host = new URL(target).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(
    `EVAL_DATABASE_URL points at ${host}, not this machine. The eval writes sessions; refusing.`,
  );
  process.exit(1);
}

process.env.DATABASE_URL = target;
process.env.DIRECT_URL = target;
for (const name of [
  'SLACK_BOT_TOKEN',
  'META_CAPI_ACCESS_TOKEN',
  'META_PIXEL_ID',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
]) {
  process.env[name] = '';
}

const corpus = resolve('../../data/chat-corpus/eval-questions.jsonl');
if (!existsSync(corpus)) {
  console.error(`${corpus} not found — run scripts/facebook-chats-import.mjs first.`);
  process.exit(1);
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env.local', '.env', '../../.env'],
    }),
    PrismaModule,
    RedisModule,
    QueueModule,
    StorageModule,
    AuditModule,
    MetaModule,
    AiModule,
  ],
})
class EvalModule {}

type Question = EvalQuestion;
type Record_ = EvalRecord;

const all: Question[] = readFileSync(corpus, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line, index) => {
    const row = JSON.parse(line) as Omit<Question, 'id'> & { thread: string };
    return { ...row, id: `${row.thread}-${index}` };
  });

let questions = sampleQuestions(all);
const topic = flag('topic');
if (topic) questions = questions.filter((q) => q.topic === topic);
const limit = Number(flag('limit') ?? questions.length);
questions = questions.slice(0, limit);

const app = await NestFactory.createApplicationContext(EvalModule, { logger: ['error', 'warn'] });

try {
  const prisma = app.get(PrismaService);
  const sessions = app.get(ChatSessionService);
  const orchestrator = app.get(TurnOrchestrator);
  const aiConfig = app.get(AiConfigService);

  // The kill switch belongs to the live widget; the eval must not depend on it.
  const original = aiConfig.get.bind(aiConfig);
  aiConfig.get = async () => ({ ...(await original()), enabled: true });
  const config = await aiConfig.get();
  const chunks = await prisma.knowledgeChunk.count();

  console.log(
    `${questions.length} questions · model ${config.chatModel} · knowledge chunks ${chunks}`,
  );

  const records: Record_[] = [];
  // Gemini's free tier allows 15 requests a minute and one question can cost four,
  // so questions go one at a time, a few seconds apart. When the quota does run
  // out the turn falls back to another model and the answers stop meaning
  // "this prompt" - which is why the default is slow rather than fast.
  const pace = Number(flag('pace') ?? 8000);

  async function ask(question: Question): Promise<Record_> {
    const { session } = await sessions.start({
      channel: ChatChannel.WEB_WIDGET,
      accessLevel: AccessLevel.PUBLIC,
      landingPage: '/eval',
    });

    let text = '';
    let grounded: boolean | null = null;
    let offline: string | undefined;
    const tools: string[] = [];

    for await (const event of orchestrator.run({
      session,
      level: AccessLevel.PUBLIC,
      message: question.text,
    })) {
      if (event.type === 'token') text += event.text;
      else if (event.type === 'tool' && event.status === 'running') tools.push(event.name);
      else if (event.type === 'done') grounded = event.grounded;
      else if (event.type === 'error') offline = event.message;
    }

    const answer = { text, grounded, tools, ...(offline ? { offline } : {}) };
    return { question, answer, checks: runChecks(question, answer) };
  }

  let lastStart = 0;
  for (const question of questions) {
    const wait = lastStart + pace - Date.now();
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    lastStart = Date.now();

    try {
      records.push(await ask(question));
      process.stdout.write('.');
    } catch (error) {
      process.stdout.write('x');
      console.error(`\n${question.text}: ${(error as Error).message}`);
    }
  }
  console.log('');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = resolve('../../data/chat-corpus/eval');
  mkdirSync(dir, { recursive: true });
  const report = renderReport(records, {
    when: new Date().toISOString(),
    model: config.chatModel,
    knowledgeChunks: chunks,
  });
  writeFileSync(resolve(dir, `${stamp}.md`), report);
  writeFileSync(resolve(dir, `${stamp}.json`), JSON.stringify(records, null, 2));
  writeFileSync(resolve(dir, 'latest.md'), report);

  console.log(report.split('\n').slice(0, 40).join('\n'));
  console.log(`\nfull report: ${resolve(dir, 'latest.md')}`);
} finally {
  await app.close();
}
