import { z } from 'zod';

export const userRoleSchema = z.enum(['USER', 'ADMIN', 'CONSULTANT', 'DOC_OFFICER']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string(),
  /** Null on a staff-created client's account until they claim a login (1B-14). */
  email: z.email().nullable(),
  name: z.string().nullable(),
  role: userRoleSchema,
  /**
   * How the account signs in — never with what. Sent on the profile an account
   * reads about itself and absent from staff listings, so a screen offers
   * "change password" and "link Google" only where they mean something.
   */
  hasPassword: z.boolean().optional(),
  hasGoogle: z.boolean().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type User = z.infer<typeof userSchema>;

export const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
  name: z.string().min(1).max(120).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema.partial().omit({ password: true });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
