import type { User } from '@gks/shared';

/**
 * A staff member as the assignee pickers and the shared inbox see them.
 *
 * Four screens each declared this same four-field object inline, three of them
 * typing `role` as a bare `string` — which is how a role comparison against a
 * misspelt literal would have compiled. It is a projection of `User`, so it is
 * derived from it rather than restated: adding a field to the account model
 * cannot leave this out of step, and `role` is the real union.
 */
export type StaffMember = Pick<User, 'id' | 'name' | 'email' | 'role'>;
