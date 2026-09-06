import { Role } from '../../prisma/client.js';

/**
 * Everyone who works the CRM/brokerage pipeline (leads, cases, contracts).
 *
 * Typed as `readonly Role[]` rather than a `const` tuple on purpose: every use
 * either spreads it into `@Roles(...)` or hands it to Prisma's `in`, and the
 * narrow tuple type made both of those need a cast.
 */
export const STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.CONSULTANT];

/**
 * Everyone who touches a case's paperwork (ARCHITECTURE.md §11) — the document
 * officer handles materials, translations and applications but has no CRM access,
 * so they are not part of {@link STAFF_ROLES}.
 */
export const DOC_STAFF_ROLES: readonly Role[] = [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER];

/** True for any staff member; a plain `USER` only ever sees their own records. */
export function isStaff(role: Role): boolean {
  return DOC_STAFF_ROLES.includes(role);
}

/**
 * True for the CRM side only — the document officer is staff but is *not* this.
 *
 * The distinction is the whole reason both lists exist, and reading
 * `isStaff(role)` where the CRM rule was meant is the easy way to widen access
 * to money and contracts by accident. Anything gated on {@link STAFF_ROLES}
 * asks this one.
 */
export function isCrmStaff(role: Role): boolean {
  return STAFF_ROLES.includes(role);
}
