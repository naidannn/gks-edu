import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AUDIT_KEY, type AuditMetadata } from '../../common/decorators/audit.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuditService } from './audit.service.js';

/**
 * 0-11 — writes one `AuditLog` row per successful `@Audit()`-marked call.
 *
 * The "before" side is whatever the handler chose to expose: routes that need
 * a true before/after pair call `AuditService.record()` themselves inside the
 * transaction. This interceptor covers the common case — who called what, with
 * which payload, and what came back.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.getAllAndOverride<AuditMetadata>(AUDIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!meta) return next.handle();

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const actor = request.user;

    return next.handle().pipe(
      tap((response) => {
        void this.audit.record({
          actorId: actor?.id ?? null,
          actorLabel: actor?.email ?? null,
          action: meta.action,
          entity: meta.entity,
          entityId: resolveId(meta.idFrom ?? 'params.id', request, response),
          before: undefined,
          after: request.body && Object.keys(request.body as object).length ? request.body : undefined,
          ip: request.ip ?? null,
          requestId: (request.headers['x-request-id'] as string) ?? null,
        });
      }),
    );
  }
}

/** Reads `params.id` / `body.caseId` / `response.id` out of the request cycle. */
function resolveId(path: string, request: Request, response: unknown): string | null {
  const [root, ...rest] = path.split('.');
  const source: unknown =
    root === 'response' ? response : (request as unknown as Record<string, unknown>)[root ?? ''];

  let current = source;
  for (const key of rest) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === 'string' ? current : null;
}
