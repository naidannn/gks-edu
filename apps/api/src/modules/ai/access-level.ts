import { Injectable } from '@nestjs/common';
import { AccessLevel, ContractStatus, Role } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/**
 * The access ladder, lowest first. A caller sees their own level *and every
 * level below it* — `allowedLevels(CONTRACTED)` is three levels, not one.
 */
export const ACCESS_LEVEL_ORDER: readonly AccessLevel[] = [
  AccessLevel.PUBLIC,
  AccessLevel.REGISTERED,
  AccessLevel.CONTRACTED,
  AccessLevel.INTERNAL,
];

/** Every level a caller at `level` may read, for the SQL `= ANY(...)` filter. */
export function allowedLevels(level: AccessLevel): AccessLevel[] {
  return ACCESS_LEVEL_ORDER.slice(0, ACCESS_LEVEL_ORDER.indexOf(level) + 1);
}

/** True when `level` is at least `floor` — for gating a tool, not a chunk. */
export function atLeast(level: AccessLevel, floor: AccessLevel): boolean {
  return ACCESS_LEVEL_ORDER.indexOf(level) >= ACCESS_LEVEL_ORDER.indexOf(floor);
}

/**
 * The pure half of the rule (AI-ASSISTANT.md §4.5), so it can be tested as a
 * truth table rather than through a database.
 *
 * Staff are INTERNAL by role. A client is CONTRACTED only by *state* — holding
 * a contract the office has countersigned — which is why it is not a `Role`: it
 * arrives and lapses without anybody editing an account (ARCHITECTURE.md §11).
 */
export function accessLevelFor(input: { role: Role | null; hasActiveContract: boolean }): AccessLevel {
  if (input.role === null) return AccessLevel.PUBLIC;
  if (input.role !== Role.USER) return AccessLevel.INTERNAL;
  return input.hasActiveContract ? AccessLevel.CONTRACTED : AccessLevel.REGISTERED;
}

/**
 * A contract that is in force. `SIGNED` counts because the client has signed
 * and is already being asked for documents; `COMPLETED` counts because someone
 * who has departed is still owed the guidance they paid for. `DRAFT`/`SENT`
 * do not: an unsigned draft is a proposal, and `TERMINATED` is over.
 */
const CONTRACTED_STATUSES: ContractStatus[] = [
  ContractStatus.SIGNED,
  ContractStatus.ACTIVE,
  ContractStatus.COMPLETED,
];

/**
 * Resolves a request's access level — the one place that decides what the
 * assistant is allowed to retrieve for whoever is asking.
 *
 * It is deliberately a server-side lookup on every turn rather than something
 * carried in the session row: a contract signed (or terminated) mid-conversation
 * changes the answer, and a level pinned at session start would keep the old one.
 */
@Injectable()
export class AccessLevelService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(user: AuthenticatedUser | null | undefined): Promise<AccessLevel> {
    if (!user) return AccessLevel.PUBLIC;
    if (user.role !== Role.USER) return AccessLevel.INTERNAL;

    return accessLevelFor({ role: user.role, hasActiveContract: await this.hasActiveContract(user.id) });
  }

  /** Whether this user holds a contract in force, on any of their cases. */
  async hasActiveContract(userId: string): Promise<boolean> {
    const contract = await this.prisma.contract.findFirst({
      where: { status: { in: CONTRACTED_STATUSES }, case: { userId } },
      select: { id: true },
    });

    return contract !== null;
  }
}
