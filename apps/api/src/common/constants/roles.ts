import { Role } from '../../prisma/client.js';

/** Everyone who works the CRM/brokerage pipeline (leads, cases, contracts). */
export const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT] as const;
