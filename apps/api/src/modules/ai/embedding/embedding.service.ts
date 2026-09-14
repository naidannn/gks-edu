import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/**
 * What a vector is going to be used for. Google's embedder is asymmetric: a
 * document and the question that should find it are embedded with different
 * task types, and using one type for both measurably loses recall.
 */
export type EmbeddingTask = 'document' | 'query';

const TASK_TYPES: Record<EmbeddingTask, string> = {
  document: 'RETRIEVAL_DOCUMENT',
  query: 'RETRIEVAL_QUERY',
};

/** Google caps a batch request at 100; 32 keeps a retry cheap. */
const BATCH_SIZE = 32;

const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

interface BatchEmbedResponse {
  embeddings?: { values?: number[] }[];
}

/**
 * Text → vector, for the knowledge base (2A-02).
 *
 * `gemini-embedding-001` with `outputDimensionality: 1536`. Multilingual, which
 * is the requirement that rules most of the field out: the corpus is Mongolian
 * Cyrillic with Korean school names and English acronyms inside the same
 * sentence. 1536 rather than the model's native 3072 because that is the
 * `vector(1536)` column and the HNSW index built on it — the dimension is
 * pinned to `EMBEDDING_DIMENSIONS` (CLAUDE.md rule 5), and changing either one
 * means re-embedding every chunk.
 *
 * A truncated output is no longer unit length, so it is re-normalised here.
 * Cosine distance does not care about magnitude, but `<=>` is not the only
 * reader — the semantic cache compares vectors directly (2B-10) — and a mixed
 * bag of lengths makes those thresholds meaningless.
 *
 * With no `GEMINI_API_KEY` it falls back to a deterministic hash vector, the
 * same arrangement `GEMINI_MOCK` and `QPAY_MOCK` have. That vector carries no
 * semantics whatsoever: it makes the pipeline runnable end to end in dev, and
 * it is the reason a golden-question run (2E-06) is meaningless without a key.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly dimensions: number;
  private warnedAboutMock = false;

  constructor(private readonly config: ConfigService) {
    this.dimensions = config.getOrThrow<number>('embeddingDimensions');
  }

  get size(): number {
    return this.dimensions;
  }

  /** True when vectors are hashed locally rather than embedded by the model. */
  get isMock(): boolean {
    return !this.config.get<string>('gemini.apiKey') || (this.config.get<boolean>('gemini.mock') ?? true);
  }

  get model(): string {
    return this.config.get<string>('gemini.embeddingModel') ?? 'gemini-embedding-001';
  }

  async embed(text: string, task: EmbeddingTask = 'document'): Promise<number[]> {
    const [vector] = await this.embedMany([text], task);
    return vector!;
  }

  /**
   * Embeds a list in order, in batches. One failing batch fails the call: a
   * partially embedded document would be indexed with holes in it, and a hole
   * in an index answers confidently rather than not at all.
   */
  async embedMany(texts: string[], task: EmbeddingTask = 'document'): Promise<number[][]> {
    if (texts.length === 0) return [];

    if (this.isMock) {
      if (!this.warnedAboutMock) {
        this.logger.warn(
          '[EMBEDDING_MOCK] GEMINI_API_KEY байхгүй тул хэш вектор ашиглаж байна — хайлтын үр дүн утгагүй',
        );
        this.warnedAboutMock = true;
      }
      return texts.map((text) => this.hashVector(text));
    }

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      vectors.push(...(await this.embedBatch(texts.slice(start, start + BATCH_SIZE), task)));
    }

    return vectors;
  }

  private async embedBatch(texts: string[], task: EmbeddingTask): Promise<number[][]> {
    const model = this.model;
    const baseUrl = this.config.get<string>('gemini.baseUrl');
    const apiKey = this.config.getOrThrow<string>('gemini.apiKey');
    const timeoutMs = this.config.get<number>('gemini.embeddingTimeoutMs') ?? 60_000;

    const body = JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType: TASK_TYPES[task],
        outputDimensionality: this.dimensions,
      })),
    });

    let lastError = '';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/models/${model}:batchEmbedContents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // A timeout or a dropped connection is worth the same retry as a 503.
        lastError = error instanceof Error ? error.message : String(error);
        await this.backoff(attempt);
        continue;
      }

      if (response.ok) {
        const payload = (await response.json()) as BatchEmbedResponse;
        return this.readVectors(payload, texts.length);
      }

      lastError = `${response.status} ${(await response.text()).slice(0, 300)}`;

      // 429 and 5xx are worth waiting out. A 400 is a bad request and will be
      // just as bad the second time — an oversized chunk, usually.
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable) break;
      await this.backoff(attempt);
    }

    throw new ServiceUnavailableException(`Embedding хүсэлт амжилтгүй боллоо: ${lastError}`);
  }

  private readVectors(payload: BatchEmbedResponse, expected: number): number[][] {
    const embeddings = payload.embeddings ?? [];
    if (embeddings.length !== expected) {
      throw new ServiceUnavailableException(
        `Embedding тоо таарахгүй: ${embeddings.length} ≠ ${expected}`,
      );
    }

    return embeddings.map((embedding) => {
      const values = embedding.values ?? [];
      if (values.length !== this.dimensions) {
        throw new ServiceUnavailableException(
          `Embedding хэмжээс таарахгүй: ${values.length} ≠ ${this.dimensions}`,
        );
      }
      return normalise(values);
    });
  }

  private async backoff(attempt: number): Promise<void> {
    if (attempt >= MAX_ATTEMPTS) return;
    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** (attempt - 1)));
  }

  /**
   * The mock vector: deterministic, unit length, and semantically empty. Two
   * texts that mean the same thing land nowhere near each other, so a search
   * over hashed vectors finds only what it was given verbatim.
   */
  private hashVector(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    let state = createHash('sha256').update(text).digest().readUInt32BE(0) || 1;

    for (let i = 0; i < this.dimensions; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      vector[i] = (state / 0xffffffff) * 2 - 1;
    }

    return normalise(vector);
  }
}

/** L2 normalisation, so every stored vector is unit length. */
function normalise(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}
