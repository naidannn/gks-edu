import { PrismaPg } from '@prisma/adapter-pg';
import type { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AccessLevel,
  KnowledgeCategory,
  KnowledgeKind,
  KnowledgeStatus,
  PrismaClient,
  Role,
} from '../../../prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { accessLevelFor, allowedLevels } from '../access-level.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { chunkBlocks } from './chunker.js';
import { extractMarkdown } from './extract/markdown.js';
import { KnowledgeService } from './knowledge.service.js';
import { RetrievalService } from './retrieval.service.js';

/**
 * 2A-10 — the leak test, against a real database.
 *
 * The access filter is SQL (`AI-ASSISTANT.md` §4.5), and SQL is the one part of
 * this module a mock cannot check: every unit test in the file next door proves
 * what the service *asked* for, not what Postgres *answered*. So this spec writes
 * one document per level into the database and asks, as each of the four kinds of
 * caller, whether anything above them comes back.
 *
 * It needs a database, so it is opt-in:
 *
 *   AI_DB_TESTS=1 pnpm --filter @gks/api test access-matrix
 *
 * Embeddings run in hash mode on purpose — the filter has nothing to do with
 * semantics, and the test should cost nothing and need no API key. The documents
 * are found by the lexical leg, which is enough to prove the filter either holds
 * or leaks.
 */
loadEnv({ path: ['.env', '../../.env'], quiet: true });

const enabled = process.env.AI_DB_TESTS === '1';

/** Every kind of caller the system has, with the level each one resolves to. */
const CALLERS = [
  { name: 'visitor (not signed in)', user: null, expected: AccessLevel.PUBLIC },
  {
    name: 'client without a contract',
    user: { role: Role.USER, hasActiveContract: false },
    expected: AccessLevel.REGISTERED,
  },
  {
    name: 'client holding a contract',
    user: { role: Role.USER, hasActiveContract: true },
    expected: AccessLevel.CONTRACTED,
  },
  { name: 'consultant', user: { role: Role.CONSULTANT, hasActiveContract: false }, expected: AccessLevel.INTERNAL },
] as const;

const LEVELS = [
  AccessLevel.PUBLIC,
  AccessLevel.REGISTERED,
  AccessLevel.CONTRACTED,
  AccessLevel.INTERNAL,
] as const;

const FIXTURE_PREFIX = 'test:access-matrix:';
const QUERY = 'дотуур байрны нөхцөл';

describe.skipIf(!enabled)('access matrix (2A-10)', () => {
  let client: PrismaClient;
  let retrieval: RetrievalService;

  beforeAll(async () => {
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    const prisma = client as unknown as PrismaService;

    const embeddings = new EmbeddingService({
      get: (key: string) => (key === 'gemini.apiKey' ? '' : undefined),
      getOrThrow: () => 1536,
    } as unknown as ConfigService);

    const knowledge = new KnowledgeService(prisma, embeddings);
    retrieval = new RetrievalService(prisma, embeddings);

    for (const level of LEVELS) {
      const body = `Дотуур байрны нөхцөл: ${level} түвшний баримт. Дотуур байранд хүсэлт гаргах журам.`;
      const document = await client.knowledgeDocument.upsert({
        where: { sourceRef: `${FIXTURE_PREFIX}${level}` },
        create: {
          sourceRef: `${FIXTURE_PREFIX}${level}`,
          title: `${level} — дотуур байр`,
          kind: KnowledgeKind.ENTRY,
          category: KnowledgeCategory.LIVING,
          accessLevel: level,
          status: KnowledgeStatus.PUBLISHED,
          question: 'Дотуур байрны нөхцөл ямар вэ?',
          body,
        },
        update: { accessLevel: level, body },
      });

      await knowledge.replaceChunks({
        documentId: document.id,
        documentTitle: document.title,
        accessLevel: level,
        universityId: null,
        chunks: chunkBlocks(extractMarkdown(body).blocks),
        contentHash: `matrix-${Date.now()}`,
      });
    }
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.knowledgeDocument.deleteMany({ where: { sourceRef: { startsWith: FIXTURE_PREFIX } } });
    await client.$disconnect();
  });

  for (const caller of CALLERS) {
    it(`never returns anything above a ${caller.name}`, async () => {
      const level = caller.user
        ? accessLevelFor({ role: caller.user.role, hasActiveContract: caller.user.hasActiveContract })
        : accessLevelFor({ role: null, hasActiveContract: false });

      expect(level).toBe(caller.expected);

      const hits = await retrieval.search({ query: QUERY, level, limit: 20 });
      const fixtures = hits.filter((hit) => hit.sourceRef?.startsWith(FIXTURE_PREFIX));

      // Every level at or below the caller is reachable…
      expect(new Set(fixtures.map((hit) => hit.accessLevel))).toEqual(new Set(allowedLevels(level)));

      // …and nothing above it is, which is the whole point.
      for (const hit of fixtures) {
        expect(allowedLevels(level)).toContain(hit.accessLevel);
      }
    }, 30_000);
  }

  it('hides a document that was unpublished without touching its chunks', async () => {
    const sourceRef = `${FIXTURE_PREFIX}${AccessLevel.PUBLIC}`;
    await client.knowledgeDocument.update({ where: { sourceRef }, data: { status: KnowledgeStatus.DRAFT } });

    const hits = await retrieval.search({ query: QUERY, level: AccessLevel.INTERNAL, limit: 20 });
    expect(hits.some((hit) => hit.sourceRef === sourceRef)).toBe(false);

    await client.knowledgeDocument.update({ where: { sourceRef }, data: { status: KnowledgeStatus.PUBLISHED } });
  }, 30_000);

  it('drops a document whose validUntil has passed', async () => {
    const sourceRef = `${FIXTURE_PREFIX}${AccessLevel.REGISTERED}`;
    await client.knowledgeDocument.update({
      where: { sourceRef },
      data: { validUntil: new Date('2020-01-01T00:00:00Z') },
    });

    const hits = await retrieval.search({ query: QUERY, level: AccessLevel.INTERNAL, limit: 20 });
    expect(hits.some((hit) => hit.sourceRef === sourceRef)).toBe(false);

    await client.knowledgeDocument.update({ where: { sourceRef }, data: { validUntil: null } });
  }, 30_000);
});

/**
 * The hermetic half: the caller → level → visible-levels chain as a table, so a
 * wrong answer here fails in CI rather than only in the opt-in run above.
 */
describe('access matrix, without a database', () => {
  it.each(CALLERS)('$name sees their level and below, never above', (caller) => {
    const level = caller.user
      ? accessLevelFor({ role: caller.user.role, hasActiveContract: caller.user.hasActiveContract })
      : accessLevelFor({ role: null, hasActiveContract: false });

    expect(level).toBe(caller.expected);

    const visible = allowedLevels(level);
    const hidden = LEVELS.filter((candidate) => !visible.includes(candidate));

    expect(visible).toContain(AccessLevel.PUBLIC);
    expect(visible.at(-1)).toBe(level);
    for (const above of hidden) {
      expect(LEVELS.indexOf(above)).toBeGreaterThan(LEVELS.indexOf(level));
    }
  });

  it('gives a contract-holder no sight of internal material', () => {
    const level = accessLevelFor({ role: Role.USER, hasActiveContract: true });

    expect(allowedLevels(level)).not.toContain(AccessLevel.INTERNAL);
  });
});
