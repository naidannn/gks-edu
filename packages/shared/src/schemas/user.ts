import { z } from 'zod';

export const userRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string().nullable(),
  role: userRoleSchema,
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
