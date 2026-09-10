import { ForbiddenException } from '@nestjs/common';
import { isCrmStaff } from '../constants/roles.js';
import type { AuthenticatedUser } from '../types/authenticated-user.js';

/**
 * "Staff, or the person this record belongs to" — the rule behind every
 * client-reachable read in cases, contracts and payments (ARCHITECTURE.md §11).
 *
 * It was written out three times, once per service, which is three places for
 * `isStaff` to be used where `isCrmStaff` was meant: a document officer would
 * then read money and contracts they have no business in.
 */
export function assertOwnerOrCrm(ownerId: string, user: AuthenticatedUser, message: string): void {
  if (!isCrmStaff(user.role) && ownerId !== user.id) {
    throw new ForbiddenException(message);
  }
}
