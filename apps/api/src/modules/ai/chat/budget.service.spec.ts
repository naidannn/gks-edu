import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SlackService } from '../../notifications/slack.service.js';
import type { AiConfigService } from '../ai-config.service.js';
import type { ChatSessionService } from './chat-session.service.js';
import { BudgetService } from './budget.service.js';

function harness(spent: number, limit = 1_000_000) {
  const aiConfig = { get: async () => ({ dailyTokenBudget: limit }) } as unknown as AiConfigService;
  const sessions = { tokensSpentToday: vi.fn().mockResolvedValue(spent) } as unknown as ChatSessionService;
  const slack = { notify: vi.fn().mockResolvedValue(undefined) } as unknown as SlackService;

  return { service: new BudgetService(aiConfig, sessions, slack), slack };
}

describe('BudgetService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('says nothing while there is room', async () => {
    const { service, slack } = harness(500_000);

    expect(await service.check()).toMatchObject({ ratio: 0.5, exhausted: false });
    expect(slack.notify).not.toHaveBeenCalled();
  });

  it('warns the office at 80%, before the assistant goes quiet', async () => {
    const { service, slack } = harness(850_000);

    const state = await service.check();

    expect(state.exhausted).toBe(false);
    expect(vi.mocked(slack.notify).mock.calls[0]![0].title).toContain('80%');
  });

  it('announces the ceiling once it is reached', async () => {
    const { service, slack } = harness(1_000_000);

    expect(await service.check()).toMatchObject({ exhausted: true });
    expect(vi.mocked(slack.notify).mock.calls[0]![0].emoji).toBe('🛑');
  });

  it('does not repeat the same alert for the rest of the day', async () => {
    // An alert that fires on every turn all afternoon is an alert people learn
    // to ignore.
    const { service, slack } = harness(900_000);

    await service.check();
    await service.check();
    await service.check();

    expect(slack.notify).toHaveBeenCalledTimes(1);
  });

  it('treats a zero limit as no limit rather than as instant exhaustion', async () => {
    const { service } = harness(50_000, 0);

    expect(await service.check()).toMatchObject({ ratio: 0, exhausted: false });
  });
});
