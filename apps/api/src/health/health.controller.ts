import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness + dependency readiness' })
  check() {
    return this.health.check([
      () => this.checkPostgres(),
      () => this.checkPgvector(),
      () => this.checkRedis(),
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
    ]);
  }

  private async checkPostgres(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { postgres: { status: 'up' } };
    } catch (error) {
      return { postgres: { status: 'down', message: (error as Error).message } };
    }
  }

  private async checkPgvector(): Promise<HealthIndicatorResult> {
    try {
      const rows = await this.prisma.$queryRaw<{ extversion: string }[]>`
        SELECT extversion FROM pg_extension WHERE extname = 'vector'
      `;
      return rows.length
        ? { pgvector: { status: 'up', version: rows[0].extversion } }
        : { pgvector: { status: 'down', message: 'vector extension is not installed' } };
    } catch (error) {
      return { pgvector: { status: 'down', message: (error as Error).message } };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    const alive = await this.redis.ping();
    return { redis: { status: alive ? 'up' : 'down' } };
  }
}
