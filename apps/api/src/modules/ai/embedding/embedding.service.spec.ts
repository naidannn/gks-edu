import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { EmbeddingService } from './embedding.service.js';

const config = { getOrThrow: () => 1536 } as unknown as ConfigService;

describe('EmbeddingService', () => {
  const service = new EmbeddingService(config);

  it('returns vectors of the configured dimension', async () => {
    const vector = await service.embed('hello');
    expect(vector).toHaveLength(1536);
  });

  it('is deterministic for the same input', async () => {
    const [a, b] = await Promise.all([service.embed('same text'), service.embed('same text')]);
    expect(a).toEqual(b);
  });

  it('produces unit-length vectors', async () => {
    const vector = await service.embed('normalise me');
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 6);
  });
});
