import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { MetaEventsService } from './meta-events.service.js';

function makeService() {
  const queue = { add: vi.fn().mockResolvedValue({ id: '1' }) };
  const config = { get: (key: string) => (key === 'notifications.appUrl' ? 'https://gksedu.mn' : undefined) };
  const service = new MetaEventsService(
    config as unknown as ConfigService,
    queue as unknown as Queue<never>,
  );
  return { service, queue };
}

/** The job body as it lands in Redis. */
function enqueued(queue: { add: ReturnType<typeof vi.fn> }) {
  return queue.add.mock.calls[0]![1].event;
}

describe('MetaEventsService', () => {
  it('hashes the identity before it reaches the queue', async () => {
    const { service, queue } = makeService();

    await service.track({
      eventName: 'Lead',
      eventId: 'evt-1',
      actionSource: 'website',
      identity: { email: 'bat@example.com', phone: '99112233', firstName: 'Бат' },
    });

    const event = enqueued(queue);
    // Nothing readable is written to Redis: a queue that backs up, or a dump
    // taken while debugging, must not spill a client's details.
    expect(JSON.stringify(event)).not.toContain('bat@example.com');
    expect(JSON.stringify(event)).not.toContain('99112233');
    expect(event.user_data.em).toEqual([createHash('sha256').update('bat@example.com').digest('hex')]);
  });

  // A colon here is not a style choice: BullMQ builds its Redis keys around
  // `:` and rejects a job id containing one, which silently dropped every
  // event until it was caught.
  it('keys the job on name and event id, so a re-delivered conversion is dropped', async () => {
    const { service, queue } = makeService();

    await service.track({
      eventName: 'Purchase',
      eventId: 'payment-1',
      actionSource: 'website',
      identity: {},
    });

    expect(queue.add.mock.calls[0]![2].jobId).toBe('Purchase-payment-1');
    expect(queue.add.mock.calls[0]![2].jobId).not.toContain(':');
  });

  it('falls back to the public app URL for a website event fired from a webhook', async () => {
    const { service, queue } = makeService();

    await service.track({ eventName: 'Purchase', eventId: 'p1', actionSource: 'website', identity: {} });

    expect(enqueued(queue).event_source_url).toBe('https://gksedu.mn');
  });

  it('leaves the source URL off an event that did not happen on the website', async () => {
    const { service, queue } = makeService();

    await service.track({ eventName: 'Purchase', eventId: 'p1', actionSource: 'physical_store', identity: {} });

    expect(enqueued(queue).event_source_url).toBeUndefined();
  });

  it('stamps the event in seconds, not milliseconds', async () => {
    const { service, queue } = makeService();
    const at = new Date('2026-09-09T00:00:00.000Z');

    await service.track({ eventName: 'Lead', eventId: 'e', actionSource: 'website', eventTime: at, identity: {} });

    expect(enqueued(queue).event_time).toBe(Math.floor(at.getTime() / 1000));
  });

  it('never lets a queue failure reach the business action that caused it', async () => {
    const { service, queue } = makeService();
    queue.add.mockRejectedValueOnce(new Error('Redis is down'));

    await expect(
      service.track({ eventName: 'Lead', eventId: 'e', actionSource: 'website', identity: {} }),
    ).resolves.toBeUndefined();
  });
});
