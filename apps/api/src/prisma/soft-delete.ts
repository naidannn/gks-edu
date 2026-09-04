/**
 * Soft-delete convention — 0-12.
 *
 * Only `CaseDocument` and `DocumentFile` carry `deletedAt`: paperwork that was
 * removed still has to be explainable months later, so the rows stay.
 *
 * Prisma 7 dropped `$use` middleware, and a global `$extends` on the injected
 * `PrismaService` would silently hide rows from every raw/aggregate path that
 * does not go through the typed client. So the convention is explicit instead:
 * every read of a soft-deletable model spreads {@link NOT_DELETED} into its
 * `where`, and every delete goes through {@link softDeletePatch}.
 */

/** Models that soft-delete rather than disappear. */
export const SOFT_DELETE_MODELS = ['CaseDocument', 'DocumentFile'] as const;

/** Spread into any `where` on a soft-deletable model. */
export const NOT_DELETED = { deletedAt: null } as const;

/** The `data` an `update` needs to soft-delete a row. */
export function softDeletePatch(at: Date = new Date()): { deletedAt: Date } {
  return { deletedAt: at };
}

/** The `data` that brings a soft-deleted row back. */
export function restorePatch(): { deletedAt: null } {
  return { deletedAt: null };
}
