import type { Role } from '../../prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  /// Null for a staff-created client that has not claimed a portal login (1B-14).
  email: string | null;
  role: Role;
}
