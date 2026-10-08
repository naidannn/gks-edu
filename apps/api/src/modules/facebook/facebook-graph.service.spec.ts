import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookGraphService } from './facebook-graph.service.js';

function makeService() {
  const values: Record<string, unknown> = {
    'facebook.pageId': 'PAGE',
    'facebook.pageAccessToken': 'page-token',
    'facebook.timeoutMs': 1_000,
    'meta.graphVersion': 'v26.0',
  };
  return new FacebookGraphService({ get: (key: string) => values[key] } as unknown as ConfigService);
}

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe('FacebookGraphService.profile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the name and picture when Meta allows it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ first_name: 'Сараа', last_name: 'Бат', profile_pic: 'https://cdn/p.jpg' })));
    expect(await makeService().profile('U1')).toEqual({ name: 'Сараа Бат', profilePic: 'https://cdn/p.jpg' });
  });

  it('falls back to the conversation participant name without App Review', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply({ error: { message: 'does not exist', code: 100, error_subcode: 33 } }, 400))
      .mockResolvedValueOnce(
        reply({ data: [{ participants: { data: [{ id: 'U1', name: 'Сараа Бат' }, { id: 'PAGE', name: 'GKS Edu Mongolia' }] } }] }),
      );
    vi.stubGlobal('fetch', fetchMock);

    expect(await makeService().profile('U1')).toEqual({ name: 'Сараа Бат', profilePic: null });
    expect(String(fetchMock.mock.calls[1]![0])).toContain('/PAGE/conversations?platform=messenger&user_id=U1');
  });

  it('returns null when neither source knows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(reply({ error: { message: 'nope', code: 100 } }, 400)),
    );
    expect(await makeService().profile('U1')).toBeNull();
  });
});
