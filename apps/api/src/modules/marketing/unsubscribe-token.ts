import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The capability in an unsubscribe link (1O).
 *
 * Signed rather than stored: a campaign goes to clients, leads and subscribers
 * alike, and most of those rows have no token column to put one in. An HMAC
 * over the address needs no row at all, never expires — a mail from last year
 * must still be able to unsubscribe you — and cannot be guessed for somebody
 * else's address, which is the only thing that matters here: without the
 * signature, `/unsubscribe?token=<their email>` would be a way to silence
 * another person's mail.
 */

function encode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function signUnsubscribeToken(email: string, secret: string): string {
  const payload = encode(normaliseEmail(email));
  return `${payload}.${sign(payload, secret)}`;
}

/** @returns the address the token was issued for, or `null` if it was tampered with. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  // `timingSafeEqual` throws on a length mismatch rather than returning false.
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  const email = Buffer.from(payload, 'base64url').toString('utf8');
  return email.includes('@') ? email : null;
}
