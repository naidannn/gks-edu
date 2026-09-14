import { describe, expect, it, vi } from 'vitest';
import { AccessLevel } from '../../../prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import {
  boostFor,
  DEFAULT_MIN_SIMILARITY,
  RetrievalService,
  RETRIEVAL_TUNING,
  rrfScore,
} from './retrieval.service.js';

function harness() {
  const queryRaw = vi.fn().mockResolvedValue([]);
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  const embeddings = {
    embedMany: vi.fn().mockResolvedValue([new Array(1536).fill(0.01)]),
  } as unknown as EmbeddingService;

  return { service: new RetrievalService(prisma, embeddings), queryRaw, embeddings };
}

/**
 * The SQL the service asked for, reassembled.
 *
 * `$queryRaw` is a tagged template, so the mock sees the template strings as the
 * first argument and every interpolation after it. A `Prisma.Sql` interpolation
 * is an inlined fragment (a tuning constant) and is rendered as its own text;
 * everything else is a bound parameter and renders as `?` — which is exactly the
 * distinction these tests are about, since a bound parameter is typed by its
 * context and an inlined one is not.
 */
function sqlOf(queryRaw: ReturnType<typeof vi.fn>): { text: string; values: unknown[] } {
  const [strings, ...values] = queryRaw.mock.calls[0] as [string[], ...unknown[]];

  const text = strings
    .map((part, index) => {
      if (index >= values.length) return part;
      const value = values[index];
      const fragment = value as { sql?: string } | null;
      return part + (fragment && typeof fragment.sql === 'string' ? fragment.sql : '?');
    })
    .join('');

  return { text, values };
}

describe('RetrievalService', () => {
  it('filters on the caller level and below, in SQL', async () => {
    const { service, queryRaw } = harness();

    await service.search({ query: 'дотуур байр', level: AccessLevel.REGISTERED });

    const { text, values } = sqlOf(queryRaw);
    expect(text).toContain('"accessLevel" = ANY');
    // The levels are bound as an array; CONTRACTED and INTERNAL are not in it.
    expect(values).toContainEqual([AccessLevel.PUBLIC, AccessLevel.REGISTERED]);
    expect(JSON.stringify(values)).not.toContain(AccessLevel.INTERNAL);
  });

  it('asks only for published, unexpired, non-playbook documents', async () => {
    const { service, queryRaw } = harness();

    await service.search({ query: 'виз', level: AccessLevel.INTERNAL });

    const { text } = sqlOf(queryRaw);
    expect(text).toContain('d.status =');
    expect(text).toContain('d.kind <>');
    expect(text).toContain('"validUntil" IS NULL OR d."validUntil" >= NOW()');
  });

  it('embeds the question as a query, not as a document', async () => {
    const { service, embeddings } = harness();

    await service.search({ query: 'хэдэн төгрөг вэ', level: AccessLevel.PUBLIC });

    expect(embeddings.embedMany).toHaveBeenCalledWith(['хэдэн төгрөг вэ'], 'query');
  });

  it('keeps a chunk found only lexically, below the similarity floor', async () => {
    const { service, queryRaw } = harness();

    await service.search({ query: 'TOPIK', level: AccessLevel.PUBLIC });

    // The gate is an OR across the three legs: "TOPIK" scores 0.60 semantically
    // on this corpus and would be thrown away by a cosine-only threshold.
    const { text } = sqlOf(queryRaw);
    expect(text).toMatch(
      /WHERE COALESCE\(sem\.similarity, 0\) >= 0\.66\s+OR lex\.rank IS NOT NULL\s+OR tri\.score IS NOT NULL/,
    );
  });

  it('never runs a query for empty input', async () => {
    const { service, queryRaw, embeddings } = harness();

    expect(await service.search({ query: '   ', level: AccessLevel.INTERNAL })).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(embeddings.embedMany).not.toHaveBeenCalled();
  });

  it('hands no playbook to a client, whatever their level', async () => {
    const { service } = harness();

    for (const level of [AccessLevel.PUBLIC, AccessLevel.REGISTERED, AccessLevel.CONTRACTED]) {
      expect(await service.playbooks(level)).toEqual([]);
    }
  });
});

describe('fusion', () => {
  it('ranks a chunk found by two legs above one found by a single better leg', () => {
    // Rank 1 on one leg alone scores less than ranks 2 and 3 together, which is
    // the point of fusing: agreement between two different searches is stronger
    // evidence than being first in one of them.
    expect(rrfScore({ semantic: 2, lexical: 3 })).toBeGreaterThan(rrfScore({ semantic: 1 }));
  });

  it('is monotone in rank', () => {
    expect(rrfScore({ semantic: 1 })).toBeGreaterThan(rrfScore({ semantic: 2 }));
    expect(rrfScore({ semantic: 30 })).toBeGreaterThan(0);
  });

  it('scores a chunk no leg found as zero', () => {
    expect(rrfScore({})).toBe(0);
    expect(rrfScore({ semantic: null, lexical: null, trigram: null })).toBe(0);
  });

  it('boosts the asked-about school more than the asked-about topic', () => {
    expect(boostFor({ university: true, category: false })).toBeGreaterThan(
      boostFor({ university: false, category: true }),
    );
    expect(boostFor({ university: false, category: false })).toBe(1);
    expect(boostFor({ university: true, category: true })).toBeCloseTo(1.3 * 1.15, 10);
  });

  it('cannot let a boost overturn the access filter', () => {
    // A boost multiplies a score; the filter removes a row. Nothing in the
    // tuning table can reinstate a chunk the WHERE clause excluded.
    expect(RETRIEVAL_TUNING.BOOST_UNIVERSITY).toBeGreaterThan(1);
    expect(RETRIEVAL_TUNING.DEFAULT_MIN_SIMILARITY).toBe(DEFAULT_MIN_SIMILARITY);
  });

  it('keeps the measured similarity floor above the noise we have observed', () => {
    // An unrelated document scored 0.624 against a real question on the dev
    // corpus; the plan's 0.62 would have admitted it.
    expect(DEFAULT_MIN_SIMILARITY).toBeGreaterThan(0.624);
    expect(DEFAULT_MIN_SIMILARITY).toBeLessThan(0.733);
  });
});
