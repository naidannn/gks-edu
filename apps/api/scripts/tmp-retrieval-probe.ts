/**
 * Throwaway probe: the hybrid retrieval SQL against the dev database, with real
 * embeddings, plus the 4x4 access matrix (2A-10 rehearsal).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { config as loadEnv } from 'dotenv';
import { AccessLevel, KnowledgeCategory, KnowledgeKind, KnowledgeStatus, PrismaClient } from '../src/generated/prisma/client.js';
import { chunkBlocks } from '../src/modules/ai/knowledge/chunker.js';
import { extractMarkdown } from '../src/modules/ai/knowledge/extract/markdown.js';
import { EmbeddingService } from '../src/modules/ai/embedding/embedding.service.js';
import { RetrievalService } from '../src/modules/ai/knowledge/retrieval.service.js';
import { KnowledgeService } from '../src/modules/ai/knowledge/knowledge.service.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
}) as unknown as import('../src/prisma/prisma.service.js').PrismaService;

const config = {
  get: (key: string) =>
    ({
      'gemini.apiKey': process.env.GEMINI_API_KEY,
      'gemini.mock': false,
      'gemini.baseUrl': 'https://generativelanguage.googleapis.com/v1beta',
      'gemini.embeddingModel': 'gemini-embedding-001',
      'gemini.embeddingTimeoutMs': 60_000,
    })[key],
  getOrThrow: (key: string) => (key === 'embeddingDimensions' ? 1536 : process.env.GEMINI_API_KEY),
} as unknown as ConfigService;

const embeddings = new EmbeddingService(config);
const knowledge = new KnowledgeService(prisma, embeddings);
const retrieval = new RetrievalService(prisma, embeddings);

/** One document per access level, so the matrix has something to leak. */
const fixtures = [
  {
    sourceRef: 'probe:public',
    accessLevel: AccessLevel.PUBLIC,
    title: 'Нийтэд нээлттэй — дотуур байр',
    body: 'Сургуулийн дотуур байранд хүсэлт гаргах журам, ямар баримт шаардагдах талаар.',
  },
  {
    sourceRef: 'probe:registered',
    accessLevel: AccessLevel.REGISTERED,
    title: 'Бүртгэлтэй — дотуур байрны нэмэлт',
    body: 'Бүртгэлтэй хэрэглэгчид дотуур байрны өрөөний төрлүүд, хоолны нөхцөлийг тайлбарлана.',
  },
  {
    sourceRef: 'probe:contracted',
    accessLevel: AccessLevel.CONTRACTED,
    title: 'Гэрээтэй — дотуур байрны гэрээний нарийн заалт',
    body: 'Гэрээтэй үйлчлүүлэгчид дотуур байрны гэрээ, цуцлалтын нөхцөлийн дэлгэрэнгүйг хүргэнэ.',
  },
  {
    sourceRef: 'probe:internal',
    accessLevel: AccessLevel.INTERNAL,
    title: 'Дотоод — дотуур байрны комиссын журам',
    body: 'Дотоод журам: дотуур байрны зуучлалын комисс, агентын гэрээний нөхцөл, оффисын тооцоо.',
  },
];

for (const fixture of fixtures) {
  const document = await (prisma as unknown as PrismaClient).knowledgeDocument.upsert({
    where: { sourceRef: fixture.sourceRef },
    create: {
      sourceRef: fixture.sourceRef,
      title: fixture.title,
      kind: KnowledgeKind.ENTRY,
      category: KnowledgeCategory.LIVING,
      accessLevel: fixture.accessLevel,
      status: KnowledgeStatus.PUBLISHED,
      question: 'Дотуур байрны талаар',
      body: fixture.body,
    },
    update: { accessLevel: fixture.accessLevel, body: fixture.body, contentHash: null },
  });

  const chunks = chunkBlocks(extractMarkdown(`## Дотуур байрны талаар\n\n${fixture.body}`).blocks);
  await knowledge.replaceChunks({
    documentId: document.id,
    documentTitle: fixture.title,
    accessLevel: fixture.accessLevel,
    universityId: null,
    chunks,
    contentHash: `probe-${Date.now()}`,
  });
}

console.log('\n— 4x4 access matrix: "дотуур байр" —');
for (const level of [AccessLevel.PUBLIC, AccessLevel.REGISTERED, AccessLevel.CONTRACTED, AccessLevel.INTERNAL]) {
  const hits = await retrieval.search({ query: 'дотуур байр ямар нөхцөлтэй вэ', level, limit: 10 });
  console.log(
    `${level.padEnd(11)} → ${hits.length} hits [${[...new Set(hits.map((hit) => hit.accessLevel))].join(', ')}]`,
  );
}

console.log('\n— scoring detail for a visitor —');
for (const hit of await retrieval.search({ query: 'дотуур байр ямар нөхцөлтэй вэ', level: AccessLevel.PUBLIC })) {
  console.log(
    `${hit.score.toFixed(5)} sim=${hit.similarity?.toFixed(3) ?? '—'} [${hit.matchedBy.join('+')}] ${hit.title}`,
  );
}

console.log('\n— a name only the lexical/trigram legs can find —');
for (const hit of await retrieval.search({ query: 'TOPIK', level: AccessLevel.INTERNAL })) {
  console.log(`${hit.score.toFixed(5)} sim=${hit.similarity?.toFixed(3) ?? '—'} [${hit.matchedBy.join('+')}] ${hit.title}`);
}

console.log('\n— nonsense query returns nothing —');
console.log((await retrieval.search({ query: 'zzzz qqqq wwww', level: AccessLevel.INTERNAL })).length, 'hits');

console.log('\n— playbooks —');
console.log('PUBLIC:', (await retrieval.playbooks(AccessLevel.PUBLIC)).length);
console.log('INTERNAL:', (await retrieval.playbooks(AccessLevel.INTERNAL)).map((p) => p.title));

console.log('\n— visible chunk counts —');
for (const level of [AccessLevel.PUBLIC, AccessLevel.REGISTERED, AccessLevel.CONTRACTED, AccessLevel.INTERNAL]) {
  console.log(level, await retrieval.countVisible(level));
}

await (prisma as unknown as PrismaClient).$disconnect();
