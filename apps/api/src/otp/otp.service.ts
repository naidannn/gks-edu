import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { RedisService } from '../redis/redis.service.js';

/** Five minutes: long enough to switch to an inbox, short enough to matter. */
export const OTP_TTL_MINUTES = 5;
const OTP_TTL_SECONDS = OTP_TTL_MINUTES * 60;
const OTP_BCRYPT_ROUNDS = 10;

/**
 * The code half of OTP e-signature verification (1C-08) — generate, store,
 * compare. Nothing here knows how the code reaches the person: the contract
 * flow mails it (1C-33), and a future channel would be one more caller rather
 * than a branch in this file. Only the hash is stored, so a Redis dump is not
 * a list of live codes.
 *
 * Whether an OTP alone is legally sufficient for a binding electronic
 * contract, or a state ID-verification system (ЭЦС/Дан) is required, is still
 * open (ARCHITECTURE.md §18, question 7).
 */
@Injectable()
export class OtpService {
  constructor(private readonly redis: RedisService) {}

  /**
   * A fresh six-digit code for `subjectId`, replacing any code still live for
   * it. The plaintext is returned rather than delivered — the caller owns the
   * channel, and it never leaves the process by any other route.
   */
  async issue(subjectId: string): Promise<string> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hash(code, OTP_BCRYPT_ROUNDS);
    await this.redis.set(this.key(subjectId), codeHash, OTP_TTL_SECONDS);
    return code;
  }

  /** True once, then the code is spent — a correct code cannot be replayed. */
  async verify(subjectId: string, code: string): Promise<boolean> {
    const codeHash = await this.redis.get<string>(this.key(subjectId));
    if (!codeHash) return false;

    const valid = await compare(code, codeHash);
    if (valid) await this.redis.del(this.key(subjectId));
    return valid;
  }

  private key(subjectId: string): string {
    return `otp:${subjectId}`;
  }
}
