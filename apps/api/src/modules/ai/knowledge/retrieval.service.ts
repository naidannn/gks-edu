import { Injectable } from '@nestjs/common';
import {
  AccessLevel,
  KnowledgeKind,
  KnowledgeStatus,
  Prisma,
  type KnowledgeCategory,
} from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { allowedLevels } from '../access-level.js';
import { EmbeddingService } from '../embedding/embedding.service.js';

/**
 * The cosine similarity below which a chunk is treated as "not an answer".
 *
 * Measured, not inherited. `gemini-embedding-001` on Mongolian text does not use
 * the bottom half of its range: against the question
 * "Материалаа хэзээнээс бэлдэж эхлэх вэ?" the document that answers it scored
 * 0.747 and a completely unrelated sales playbook scored 0.624. The plan's 0.62
 * would therefore have let that unrelated chunk through — which is the one
 * failure mode the threshold exists to prevent, since a retrieved chunk is a
 * chunk the model will try to answer from (principle 2).
 *
 * 0.66 sits above the noise floor we have measured and below the weakest real
 * match. It is a starting value under `AiAssistantConfig.minSimilarity` (2B-02),
 * and the golden questions (2E-06) are what move it.
 */
export const DEFAULT_MIN_SIMILARITY = 0.66;

/** Trigram similarity that counts as a name match — "TOPIK", "D-2", a misspelt school. */
const TRIGRAM_FLOOR = 0.3;

/** Reciprocal-rank-fusion constant. 60 is the value the RRF paper settles on. */
const RRF_K = 60;

/** How many candidates each leg of the search contributes before fusion. */
const CANDIDATES_PER_LEG = 30;

const BOOST_UNIVERSITY = 1.3;
const BOOST_CATEGORY = 1.15;

export interface RetrievalQuery {
  query: string;
  /** The caller's level. Chunks above it are excluded in SQL, never in a prompt. */
  level: AccessLevel;
  /** The school being discussed, if any — its documents are boosted. */
  universityId?: string | null;
  category?: KnowledgeCategory | null;
  limit?: number;
  minSimilarity?: number;
}

export interface RetrievalHit {
  chunkId: string;
  documentId: string;
  title: string;
  kind: KnowledgeKind;
  category: KnowledgeCategory;
  accessLevel: AccessLevel;
  heading: string | null;
  content: string;
  /** Cosine similarity, or null when this chunk was found only lexically. */
  similarity: number | null;
  /** Fused score — comparable within one result set, not across queries. */
  score: number;
  /** Which legs of the hybrid search found it, for the admin search test. */
  matchedBy: ('semantic' | 'lexical' | 'trigram')[];
  sourceRef: string | null;
}

interface RawHit {
  chunkId: string;
  documentId: string;
  title: string;
  kind: KnowledgeKind;
  category: KnowledgeCategory;
  accessLevel: AccessLevel;
  heading: string | null;
  content: string;
  similarity: number | null;
  lexicalRank: number | null;
  trigramScore: number | null;
  semanticPosition: number | null;
  lexicalPosition: number | null;
  trigramPosition: number | null;
  sourceRef: string | null;
}

/**
 * Hybrid retrieval over the knowledge base (2A-06, AI-ASSISTANT.md §4.4).
 *
 * Three legs, fused by reciprocal rank:
 *
 * - **semantic** — pgvector cosine. Finds "хэдэн төгрөг" when the document says
 *   "төлбөр", which is most of what a visitor asks.
 * - **lexical** — the generated `tsv` with the `simple` configuration, because
 *   Postgres has no Mongolian stemmer and stemming Cyrillic with the English
 *   dictionary is worse than not stemming.
 * - **trigram** — `pg_trgm`, the leg that matches "TOPIK", "D-2" and a school
 *   name somebody spelt their own way. Semantic search blurs exactly these.
 *
 * Everything that decides *whether a chunk may be seen* is in the SQL `WHERE`:
 * access level, publication status, expiry. That is the whole of the leak
 * protection on this side — a model cannot disclose text it was never handed —
 * and it is why this service takes an `AccessLevel` rather than a user.
 *
 * Playbooks are excluded here by design: they are behaviour instructions for the
 * prompt (2A-09), never material to quote, so they are fetched by their own
 * method and never appear as a citation.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async search(query: RetrievalQuery): Promise<RetrievalHit[]> {
    const text = query.query.trim();
    if (text.length === 0) return [];

    const limit = query.limit ?? 8;
    const minSimilarity = query.minSimilarity ?? DEFAULT_MIN_SIMILARITY;
    const levels = allowedLevels(query.level);

    const [vector] = await this.embeddings.embedMany([text], 'query');
    const literal = `[${vector!.join(',')}]`;

    // The tuning constants are inlined rather than bound. They are compile-time
    // numbers, never user input, and a bound parameter here is typed by context:
    // Postgres reads the boost beside `CASE … ELSE 1` as an integer and rejects
    // 1.3 outright (22P02). Inlining also lets the planner see the LIMITs.
    const k = Prisma.raw(String(RRF_K));
    const candidates = Prisma.raw(String(CANDIDATES_PER_LEG));
    const trigramFloor = Prisma.raw(String(TRIGRAM_FLOOR));
    const boostUniversity = Prisma.raw(String(BOOST_UNIVERSITY));
    const boostCategory = Prisma.raw(String(BOOST_CATEGORY));
    const similarityFloor = Prisma.raw(String(minSimilarity));

    const rows = await this.prisma.$queryRaw<RawHit[]>`
      WITH scope AS (
        SELECT
          c.id, c."documentId", c.heading, c.content, c."accessLevel", c."universityId",
          c.embedding, c.tsv,
          d.title, d.kind, d.category, d."sourceRef"
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c."documentId"
        WHERE d.status = ${KnowledgeStatus.PUBLISHED}::"KnowledgeStatus"
          AND d.kind <> ${KnowledgeKind.PLAYBOOK}::"KnowledgeKind"
          AND (d."validUntil" IS NULL OR d."validUntil" >= NOW())
          AND c."accessLevel" = ANY(${levels}::"AccessLevel"[])
      ),
      semantic AS (
        SELECT id,
               1 - (embedding <=> ${literal}::vector) AS similarity,
               ROW_NUMBER() OVER (ORDER BY embedding <=> ${literal}::vector) AS position
        FROM scope
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${candidates}
      ),
      lexical AS (
        SELECT id,
               ts_rank(tsv, plainto_tsquery('simple', ${text})) AS rank,
               ROW_NUMBER() OVER (ORDER BY ts_rank(tsv, plainto_tsquery('simple', ${text})) DESC) AS position
        FROM scope
        WHERE tsv @@ plainto_tsquery('simple', ${text})
        ORDER BY rank DESC
        LIMIT ${candidates}
      ),
      trigram AS (
        SELECT id,
               similarity(content, ${text}) AS score,
               ROW_NUMBER() OVER (ORDER BY similarity(content, ${text}) DESC) AS position
        FROM scope
        WHERE similarity(content, ${text}) >= ${trigramFloor}
        ORDER BY score DESC
        LIMIT ${candidates}
      ),
      candidates AS (
        SELECT id FROM semantic
        UNION SELECT id FROM lexical
        UNION SELECT id FROM trigram
      )
      SELECT
        s.id              AS "chunkId",
        s."documentId"    AS "documentId",
        s.title           AS title,
        s.kind            AS kind,
        s.category        AS category,
        s."accessLevel"   AS "accessLevel",
        s.heading         AS heading,
        s.content         AS content,
        sem.similarity    AS similarity,
        lex.rank          AS "lexicalRank",
        tri.score         AS "trigramScore",
        sem.position      AS "semanticPosition",
        lex.position      AS "lexicalPosition",
        tri.position      AS "trigramPosition",
        s."sourceRef"     AS "sourceRef",
        -- The boosts live in SQL so the ordering the database returns is the
        -- ordering the caller uses: ORDER BY has to see them.
        (
          COALESCE(1.0 / (${k} + sem.position), 0)
          + COALESCE(1.0 / (${k} + lex.position), 0)
          + COALESCE(1.0 / (${k} + tri.position), 0)
        )
        * CASE WHEN ${query.universityId ?? null}::uuid IS NOT NULL
                 AND s."universityId" = ${query.universityId ?? null}::uuid
               THEN ${boostUniversity} ELSE 1 END
        * CASE WHEN ${query.category ?? null}::"KnowledgeCategory" IS NOT NULL
                 AND s.category = ${query.category ?? null}::"KnowledgeCategory"
               THEN ${boostCategory} ELSE 1 END
        AS score
      FROM candidates
      JOIN scope s ON s.id = candidates.id
      LEFT JOIN semantic sem ON sem.id = candidates.id
      LEFT JOIN lexical lex ON lex.id = candidates.id
      LEFT JOIN trigram tri ON tri.id = candidates.id
      -- A chunk survives on *any* leg: the semantic threshold, an exact lexical
      -- hit, or a strong trigram match. Gating everything on cosine similarity
      -- would throw away the "TOPIK"-style matches the other legs exist for.
      WHERE COALESCE(sem.similarity, 0) >= ${similarityFloor}
         OR lex.rank IS NOT NULL
         OR tri.score IS NOT NULL
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => this.toHit(row));
  }

  /**
   * The sales playbooks for a caller's level (2A-09).
   *
   * Separate from `search` on purpose: a playbook is never retrieved, never
   * cited and never quoted to a client. It joins the system prompt as behaviour
   * guidance, and the guard (2B-08) checks that its wording did not leak into an
   * answer.
   */
  async playbooks(level: AccessLevel, limit = 5): Promise<{ title: string; body: string }[]> {
    if (level !== AccessLevel.INTERNAL) return [];

    const documents = await this.prisma.knowledgeDocument.findMany({
      where: {
        kind: KnowledgeKind.PLAYBOOK,
        status: KnowledgeStatus.PUBLISHED,
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { title: true, body: true },
    });

    return documents
      .filter((document): document is { title: string; body: string } => Boolean(document.body))
      .map((document) => ({ title: document.title, body: document.body }));
  }

  /** How many chunks a caller at this level can see at all — the admin search test shows it. */
  async countVisible(level: AccessLevel): Promise<number> {
    return this.prisma.knowledgeChunk.count({
      where: {
        accessLevel: { in: allowedLevels(level) },
        document: {
          status: KnowledgeStatus.PUBLISHED,
          kind: { not: KnowledgeKind.PLAYBOOK },
          OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
        },
      },
    });
  }

  private toHit(row: RawHit): RetrievalHit {
    const matchedBy: RetrievalHit['matchedBy'] = [];
    if (row.semanticPosition !== null) matchedBy.push('semantic');
    if (row.lexicalPosition !== null) matchedBy.push('lexical');
    if (row.trigramPosition !== null) matchedBy.push('trigram');

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      title: row.title,
      kind: row.kind,
      category: row.category,
      accessLevel: row.accessLevel,
      heading: row.heading,
      content: row.content,
      similarity: row.similarity === null ? null : Number(row.similarity),
      score: Number((row as unknown as { score: number }).score),
      matchedBy,
      sourceRef: row.sourceRef,
    };
  }
}

/**
 * The fusion the SQL above performs, as a function — the place to read (and
 * test) what the scoring means without a database.
 *
 * Reciprocal rank fusion rather than a weighted sum of the three scores, because
 * the scores are not comparable: cosine similarity lives in 0.6–0.8 on this
 * corpus, `ts_rank` in 0–0.1, and trigram similarity in 0–1. Ranks are.
 */
export function rrfScore(positions: {
  semantic?: number | null;
  lexical?: number | null;
  trigram?: number | null;
}): number {
  return (
    (positions.semantic ? 1 / (RRF_K + positions.semantic) : 0) +
    (positions.lexical ? 1 / (RRF_K + positions.lexical) : 0) +
    (positions.trigram ? 1 / (RRF_K + positions.trigram) : 0)
  );
}

/** The multiplier applied to a fused score for matching the asked-about school or topic. */
export function boostFor(match: { university: boolean; category: boolean }): number {
  return (match.university ? BOOST_UNIVERSITY : 1) * (match.category ? BOOST_CATEGORY : 1);
}

export const RETRIEVAL_TUNING = {
  RRF_K,
  TRIGRAM_FLOOR,
  CANDIDATES_PER_LEG,
  BOOST_UNIVERSITY,
  BOOST_CATEGORY,
  DEFAULT_MIN_SIMILARITY,
} as const;
