import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Thin wrapper over the raw ioredis client.
 *
 * Use `CacheService` (cache-manager) for plain read-through caching; reach for
 * this service when you need Redis primitives directly — locks, counters,
 * pub/sub, sorted sets.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) public readonly client: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const raw = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, raw, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, raw);
    }
  }

  async del(...keys: string[]): Promise<number> {
    return keys.length ? this.client.del(...keys) : 0;
  }

  /** Deletes every key matching a glob pattern without blocking Redis (SCAN, not KEYS). */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let removed = 0;

    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 250);
      cursor = next;
      if (keys.length) {
        removed += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    return removed;
  }

  /** Best-effort distributed lock. Returns the unlock token, or null if already held. */
  async acquireLock(key: string, ttlSeconds = 30): Promise<string | null> {
    const token = crypto.randomUUID();
    const result = await this.client.set(`lock:${key}`, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const released = await this.client.eval(script, 1, `lock:${key}`, token);
    return released === 1;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
    this.logger.log('Redis connection closed');
  }
}
