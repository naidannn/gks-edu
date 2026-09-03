import { loginSchema, registerSchema } from '@gks/shared';
import { describe, expect, it } from 'vitest';

describe('auth schemas', () => {
  it('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: 'password123' });
    expect(result.success).toBe(true);
  });

  it('rejects a short password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.co', password: 'short' });
    expect(result.success).toBe(false);
  });

  it('rejects a malformed email', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: 'password123' });
    expect(result.success).toBe(false);
  });

  it('allows an optional name on register', () => {
    const result = registerSchema.safeParse({ email: 'a@b.co', password: 'password123' });
    expect(result.success).toBe(true);
  });
});
