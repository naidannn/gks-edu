import { z } from 'zod';
import { userSchema } from './user';

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = loginSchema.extend({
  name: z.string().min(1).max(120).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authSessionSchema = authTokensSchema.extend({
  user: userSchema,
});

export type AuthSession = z.infer<typeof authSessionSchema>;
