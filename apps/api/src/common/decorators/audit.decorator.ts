import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditMetadata {
  /** Dotted action name stored on the row, e.g. `case.transition`. */
  action: string;
  /** Prisma model the action targets, e.g. `Case`. */
  entity: string;
  /**
   * Where the entity id lives on the request. `params.id` is the default;
   * `body.caseId` and `response.id` (the handler's return value) also work.
   */
  idFrom?: string;
}

/**
 * Marks a route as audit-worthy (0-11). `AuditInterceptor` writes one
 * `AuditLog` row per successful call — failures are already covered by
 * `AllExceptionsFilter`, and logging attempts would double every 4xx.
 */
export const Audit = (meta: AuditMetadata) => SetMetadata(AUDIT_KEY, meta);
