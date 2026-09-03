import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service.js';
import { REDIS_CLIENT, RedisService } from './redis.service.js';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [new KeyvRedis(config.getOrThrow<string>('redisUrl'))],
        ttl: 60_000,
      }),
    }),
  ],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis(config.getOrThrow<string>('redisUrl'), {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
        }),
    },
    RedisService,
    CacheService,
  ],
  exports: [RedisService, CacheService, CacheModule],
})
export class RedisModule {}
