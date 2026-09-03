import type { Role } from '../../prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}
