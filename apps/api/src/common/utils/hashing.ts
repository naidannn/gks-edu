import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';

/**
 * The two hashes this system uses, in one place.
 *
 * They were copied into four services, and a cost factor that drifts between
 * them is invisible until someone compares two rows in the database.
 */

/**
 * bcrypt work factor for every stored password. One number, because a login
 * written at cost 12 and a reset written at cost 10 are the same account with
 * two different strengths.
 */
export const BCRYPT_ROUNDS = 12;

/** Hashes a password at {@link BCRYPT_ROUNDS}. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

/**
 * Hex SHA-256 — how every bearer-ish secret is stored: refresh tokens, claim
 * invitations, password-reset links. The raw value only ever exists in the
 * link or the client's hands.
 */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
