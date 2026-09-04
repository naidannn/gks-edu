import { Role } from '../../prisma/client.js';

/** Everyone who works the CRM/brokerage pipeline (leads, cases, contracts). */
export const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT] as const;

/**
 * Everyone who touches a case's paperwork (ARCHITECTURE.md §11) — the document
 * officer handles materials, translations and applications but has no CRM access,
 * so they are not part of {@link STAFF_ROLES}.
 */
export const DOC_STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER] as const;

/** True for any staff member; a plain `USER` only ever sees their own records. */
export function isStaff(role: Role): boolean {
  return (DOC_STAFF_ROLES as readonly Role[]).includes(role);
}
