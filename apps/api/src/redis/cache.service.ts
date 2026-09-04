import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { RedisService } from './redis.service.js';

/**
 * Read-through cache helper. `wrap` is the one you usually want: it returns the
 * cached value, or computes it once and stores it.
 */
@Injectable()
export class CacheService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly redis: RedisService,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.cache.get<T>(key)) ?? undefined;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.cache.set(key, value, ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  /**
   * Drops every key matching a glob — for caches keyed by their query, where
   * the caller cannot enumerate what it wrote (`universities:list:*`).
   */
  async delByPattern(pattern: string): Promise<void> {
    await this.redis.delByPattern(pattern);
  }

  async wrap<T>(key: string, factory: () => Promise<T>, ttlMs = 60_000): Promise<T> {
    const cached = await this.cache.get<T>(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.cache.set(key, value, ttlMs);
    return value;
  }
}
