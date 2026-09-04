import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CASE_PARAM_KEY } from '../decorators/case-param.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/** What the guard resolved, cached on the request for handlers to reuse. */
export interface CaseAccessContext {
  caseId: string;
  ownerId: string;
  assignedConsultantId: string | null;
  assignedDocOfficerId: string | null;
}

declare module 'express' {
  interface Request {
    caseAccess?: CaseAccessContext;
  }
}

/**
 * 0-13 — role **and** ownership, as ARCHITECTURE.md §11 requires.
 *
 * | Role | Passes when |
 * |---|---|
 * | `ADMIN` | always |
 * | `CONSULTANT` | the case is assigned to them, or has no consultant yet |
 * | `DOC_OFFICER` | the case is assigned to them, or has no doc officer yet |
 * | `USER` | they own the case |
 *
 * The "unassigned passes" rule is deliberate: a case with nobody on it must
 * stay reachable, otherwise new work becomes invisible to the very people
 * expected to pick it up.
 */
@Injectable()
export class CaseAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Нэвтрэх шаардлагатай');

    const paramName =
      this.reflector.getAllAndOverride<string>(CASE_PARAM_KEY, [context.getHandler(), context.getClass()]) ?? 'caseId';

    const caseId = readParam(request, paramName);
    // No case in the route — nothing for this guard to decide.
    if (!caseId) return true;

    const found = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, userId: true, assignedConsultantId: true, assignedDocOfficerId: true },
    });
    if (!found) throw new NotFoundException('Хэрэг олдсонгүй');

    if (!this.isAllowed(user, found)) {
      throw new ForbiddenException('Энэ хэрэгт хандах эрхгүй байна');
    }

    request.caseAccess = {
      caseId: found.id,
      ownerId: found.userId,
      assignedConsultantId: found.assignedConsultantId,
      assignedDocOfficerId: found.assignedDocOfficerId,
    };
    return true;
  }

  private isAllowed(
    user: AuthenticatedUser,
    found: { userId: string; assignedConsultantId: string | null; assignedDocOfficerId: string | null },
  ): boolean {
    switch (user.role) {
      case Role.ADMIN:
        return true;
      case Role.CONSULTANT:
        return found.assignedConsultantId === null || found.assignedConsultantId === user.id;
      case Role.DOC_OFFICER:
        return found.assignedDocOfficerId === null || found.assignedDocOfficerId === user.id;
      default:
        return found.userId === user.id;
    }
  }
}

function readParam(request: Request, name: string): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  const body = (request.body ?? {}) as Record<string, unknown>;
  const query = request.query as Record<string, unknown>;
  const candidate = params[name] ?? body[name] ?? query[name];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}
