import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AiConfigService } from './ai-config.service.js';

function harness(row: Record<string, unknown> = { id: 'default', enabled: true }) {
  const prisma = {
    aiAssistantConfig: {
      upsert: vi.fn().mockResolvedValue(row),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
    },
  } as unknown as PrismaService;

  return { service: new AiConfigService(prisma), prisma };
}

describe('AiConfigService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the row once and memoises it — this is on the path of every turn', async () => {
    const { service, prisma } = harness();

    await service.get();
    await service.get();

    expect(prisma.aiAssistantConfig.upsert).toHaveBeenCalledTimes(1);
  });

  it('re-reads after an edit', async () => {
    const { service, prisma } = harness();

    await service.get();
    await service.update({ persona: 'Шинэ хэв маяг, арай илүү албан ёсны өнгө аястай.' }, 'user-1');
    await service.get();

    // upsert: the first read, the update, the re-read.
    expect(prisma.aiAssistantConfig.upsert).toHaveBeenCalledTimes(3);
  });

  it('records who changed it', async () => {
    const { service, prisma } = harness();

    await service.update({ enabled: true }, 'user-1');

    expect(vi.mocked(prisma.aiAssistantConfig.upsert).mock.calls[0]![0].update).toMatchObject({
      updatedById: 'user-1',
    });
  });

  it('turns the assistant off when the config cannot be read', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.aiAssistantConfig.upsert).mockRejectedValue(new Error('pooler is down'));

    // Fail-closed: the widget falls back to the messenger rather than answering
    // from defaults nobody chose.
    expect(await service.isEnabled()).toBe(false);
  });

  it('reports the switch as the business set it', async () => {
    expect(await harness({ id: 'default', enabled: false }).service.isEnabled()).toBe(false);
    expect(await harness({ id: 'default', enabled: true }).service.isEnabled()).toBe(true);
  });

  describe('providerFor', () => {
    it('routes on the model-name prefix, the rule 1H-16 established', () => {
      expect(AiConfigService.providerFor('deepseek-v4-flash')).toBe('deepseek');
      expect(AiConfigService.providerFor('gemini-3.1-flash-lite')).toBe('gemini');
      // Anything unfamiliar goes to Gemini, which is the primary provider.
      expect(AiConfigService.providerFor('some-new-model')).toBe('gemini');
    });
  });
});
