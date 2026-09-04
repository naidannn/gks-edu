import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

/**
 * Global BullMQ connection (completes 0-10). Feature modules register their
 * own queues/processors with `BullModule.registerQueue({ name: ... })` —
 * this module only wires the shared Redis connection so every queue in the
 * app talks to the same instance the rest of the codebase uses.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ requires its own connection with maxRetriesPerRequest: null
        // (blocking commands) — the app's shared `REDIS_CLIENT` cannot be reused.
        connection: new Redis(config.getOrThrow<string>('redisUrl'), { maxRetriesPerRequest: null }),
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
