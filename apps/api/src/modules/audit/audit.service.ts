import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto.js';

/** Field names that must never reach the audit table (0-11 / §16 security). */
const REDACTED_KEYS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'accessToken',
  'otp',
  'code',
  'claimToken',
  'tokenHash',
  'claimTokenHash',
]);

export interface AuditEntry {
  actorId?: string | null;
  actorLabel?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Never throws: an audit write failing must not fail the business action it
   * describes. A dropped row is logged loudly instead.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorLabel: entry.actorLabel?.slice(0, 160) ?? null,
          action: entry.action.slice(0, 80),
          entity: entry.entity.slice(0, 60),
          entityId: entry.entityId ?? null,
          before: redact(entry.before),
          after: redact(entry.after),
          ip: entry.ip?.slice(0, 64) ?? null,
          requestId: entry.requestId?.slice(0, 64) ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Аудитын бичлэг бүтэлгүйтлээ (${entry.action})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Admin-facing log reader (ARCHITECTURE.md §11). */
  async list(query: PaginationQueryDto & { entity?: string; entityId?: string; actorId?: string; action?: string }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: { startsWith: query.action } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }
}

/**
 * Deep-copies a payload, replacing secret-looking values with `"[redacted]"`.
 * Returns `Prisma.JsonNull`-compatible `undefined` for nothing to store.
 */
export function redact(value: unknown, depth = 0): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (depth > 6) return '[too deep]';

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redact(item, depth + 1) ?? null) as Prisma.InputJsonValue;
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : (redact(item, depth + 1) ?? null);
    }
    return out as Prisma.InputJsonValue;
  }

  // Decimal and other value objects serialise through their own toString().
  if (typeof value === 'bigint') return value.toString();
  return value as Prisma.InputJsonValue;
}
