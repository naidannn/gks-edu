import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

/**
 * Placeholder embedding provider.
 *
 * It produces a deterministic, L2-normalised pseudo-embedding from the text so
 * the pgvector wiring is runnable out of the box with no API key. The vectors
 * carry no semantics — swap this implementation for a real model (Voyage AI,
 * OpenAI, a local sentence-transformer) before relying on the results.
 */
@Injectable()
export class EmbeddingService {
  private readonly dimensions: number;

  constructor(config: ConfigService) {
    this.dimensions = config.getOrThrow<number>('embeddingDimensions');
  }

  get size(): number {
    return this.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return this.pseudoEmbed(text);
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }

  private pseudoEmbed(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    const seed = createHash('sha256').update(text).digest();

    // Expand the 32-byte digest across the full dimension with a cheap PRNG.
    let state = seed.readUInt32BE(0) || 1;
    for (let i = 0; i < this.dimensions; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      vector[i] = (state / 0xffffffff) * 2 - 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / magnitude);
  }
}
