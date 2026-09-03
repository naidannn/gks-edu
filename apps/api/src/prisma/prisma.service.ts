import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './client.js';

/**
 * Prisma 7 talks to Postgres through a driver adapter rather than a bundled
 * engine, so the connection string is configured here (the CLI reads its own
 * from `prisma.config.ts`).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        // The Supabase transaction pooler multiplexes connections already, so
        // keep this pool small; raise it when pointing at a direct connection.
        max: Number.parseInt(process.env.DATABASE_POOL_MAX ?? '10', 10),
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      }),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Wipes every table — test helper, refuses to run outside NODE_ENV=test. */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('truncateAll() is only available when NODE_ENV=test');
    }

    const tables = await this.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
    `;

    for (const { tablename } of tables) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE "public"."${tablename}" CASCADE;`);
    }
  }
}
