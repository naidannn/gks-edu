import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmbeddingService } from './embedding.service.js';

function configFor(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

const mockConfig = configFor({ embeddingDimensions: 1536, 'gemini.apiKey': '' });

const liveConfig = configFor({
  embeddingDimensions: 1536,
  'gemini.apiKey': 'test-key',
  'gemini.mock': false,
  'gemini.baseUrl': 'https://example.test/v1beta',
  'gemini.embeddingModel': 'gemini-embedding-001',
  'gemini.embeddingTimeoutMs': 1_000,
});

/** A batch reply whose vectors are all `fill`, `count` of them. */
function batchReply(count: number, fill = 0.5) {
  return {
    ok: true,
    json: async () => ({
      embeddings: Array.from({ length: count }, () => ({ values: new Array(1536).fill(fill) })),
    }),
  } as Response;
}

describe('EmbeddingService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('without an API key', () => {
    const service = new EmbeddingService(mockConfig);

    it('falls back to hashed vectors of the configured dimension', async () => {
      expect(service.isMock).toBe(true);
      expect(await service.embed('hello')).toHaveLength(1536);
    });

    it('is deterministic for the same input', async () => {
      const [a, b] = await Promise.all([service.embed('same text'), service.embed('same text')]);
      expect(a).toEqual(b);
    });

    it('produces unit-length vectors', async () => {
      const vector = await service.embed('normalise me');
      expect(magnitude(vector)).toBeCloseTo(1, 6);
    });
  });

  describe('with an API key', () => {
    it('asks the model once per batch of 32 and keeps the input order', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(batchReply(32, 0.1))
        .mockResolvedValueOnce(batchReply(3, 0.2));

      const service = new EmbeddingService(liveConfig);
      const vectors = await service.embedMany(Array.from({ length: 35 }, (_, i) => `chunk ${i}`));

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vectors).toHaveLength(35);
      // First batch first: the order a caller stores chunks in is the order
      // their `chunkIndex` assumes.
      expect(vectors[0]![0]).toBeCloseTo(vectors[31]![0]!, 10);
      expect(vectors[32]![0]).toBeCloseTo(vectors[34]![0]!, 10);
    });

    it('embeds a query with the query task type, not the document one', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(batchReply(1));

      await new EmbeddingService(liveConfig).embed('хэдэн төгрөг вэ', 'query');

      const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
        requests: { taskType: string; outputDimensionality: number }[];
      };
      expect(body.requests[0]!.taskType).toBe('RETRIEVAL_QUERY');
      // The dimension is pinned to the `vector(1536)` column, not left to the model.
      expect(body.requests[0]!.outputDimensionality).toBe(1536);
    });

    it('normalises a truncated vector back to unit length', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(batchReply(1, 0.7));

      expect(magnitude(await new EmbeddingService(liveConfig).embed('truncated'))).toBeCloseTo(1, 6);
    });

    it('retries a 429 and succeeds on the next attempt', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'slow down' } as Response)
        .mockResolvedValueOnce(batchReply(1));

      const vectors = await new EmbeddingService(liveConfig).embedMany(['retry me']);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(vectors).toHaveLength(1);
    });

    it('does not retry a 400 — an oversized chunk fails the same way twice', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: false, status: 400, text: async () => 'too long' } as Response);

      await expect(new EmbeddingService(liveConfig).embedMany(['bad'])).rejects.toThrow(/400/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('refuses a reply that is short a vector rather than indexing a hole', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(batchReply(1));

      await expect(new EmbeddingService(liveConfig).embedMany(['a', 'b'])).rejects.toThrow(/таарахгүй/);
    });

    it('refuses a vector of the wrong dimension', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [{ values: new Array(768).fill(0.1) }] }),
      } as Response);

      await expect(new EmbeddingService(liveConfig).embedMany(['a'])).rejects.toThrow(/хэмжээс/);
    });

    it('embeds nothing for an empty list, and asks nobody', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch');

      expect(await new EmbeddingService(liveConfig).embedMany([])).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});

function magnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}
