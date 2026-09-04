import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';
import { RedisService } from '../redis/redis.service.js';
import { SmsService } from './sms.service.js';

const OTP_TTL_SECONDS = 5 * 60;
const OTP_BCRYPT_ROUNDS = 10;

/**
 * OTP-based e-signature verification (1C-08). Whether this alone is legally
 * sufficient for a binding electronic contract, or a state ID-verification
 * system (ЭЦС/Дан) is required, is still open (ARCHITECTURE.md §18, question 7).
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly redis: RedisService,
    private readonly sms: SmsService,
  ) {}

  async issue(subjectId: string, phone: string): Promise<void> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hash(code, OTP_BCRYPT_ROUNDS);
    await this.redis.set(this.key(subjectId), codeHash, OTP_TTL_SECONDS);
    await this.sms.send(phone, `GKSedu.mn баталгаажуулах код: ${code} (5 минутын хугацаатай)`);
  }

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
