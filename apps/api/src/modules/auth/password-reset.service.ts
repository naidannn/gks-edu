import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import {
  passwordChangedEmail,
  passwordResetEmail,
  passwordResetGoogleEmail,
} from '../notifications/email/transactional.js';

/** Short by design: the link is a password in an inbox. */
const RESET_TTL_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

/**
 * "Нууц үгээ мартсан" (§4a).
 *
 * Two rules the flow is built around:
 *  - The request endpoint answers the same way whether or not the address is
 *    registered. Telling an anonymous caller "энэ имэйл бүртгэлгүй" hands them
 *    a list of who our clients are.
 *  - Setting a new password revokes every refresh token. If the reset was
 *    prompted by someone else being in the account, staying signed in is
 *    exactly what must not happen.
 *
 * These mails bypass `NotificationsService` deliberately: they are not
 * notifications, they carry a credential, and a recipient who switched email
 * notifications off must still be able to get back into their account.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async request(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
      select: { id: true, email: true, name: true, password: true, googleId: true },
    });

    if (!user?.email) return;

    // A Google-only account has no password to reset. Rather than a dead end,
    // the mail says so and points at the sign-in button they already use.
    if (!user.password && user.googleId) {
      await this.email.send(
        user.email,
        passwordResetGoogleEmail({ name: user.name, loginUrl: this.email.link('/login') }),
        'password_reset_google',
      );
      return;
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: sha256(token), passwordResetExpiresAt: expiresAt },
    });

    await this.email.send(
      user.email,
      passwordResetEmail({
        name: user.name,
        email: user.email,
        link: this.email.link(`/reset-password?token=${token}`),
      }),
      'password_reset',
    );

    this.logger.log(`Нууц үг сэргээх холбоос илгээлээ: ${user.email}`);
  }

  async reset(token: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetTokenHash: sha256(token) },
      select: { id: true, email: true, name: true, passwordResetExpiresAt: true, isActive: true },
    });

    // One message for a wrong token and an expired one — see AccountClaimService.
    if (!user || !user.isActive || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException('Холбоос хүчингүй эсвэл хугацаа нь дууссан байна');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: await hash(password, BCRYPT_ROUNDS),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          // A reset settles an outstanding invitation too (1B-17).
          claimTokenHash: null,
          claimTokenExpiresAt: null,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (user.email) {
      await this.email
        .send(
          user.email,
          passwordChangedEmail({ name: user.name, loginUrl: this.email.link('/login') }),
          'password_changed',
        )
        // The password is already changed; a mail failure must not undo it.
        .catch((error: unknown) => this.logger.error(`Баталгааны имэйл илгээгдсэнгүй: ${String(error)}`));
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
