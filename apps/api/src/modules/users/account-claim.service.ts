import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword, sha256 } from '../../common/utils/hashing.js';
import { Role } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import { accountClaimEmail, clientWelcomeEmail } from '../notifications/email/transactional.js';

/** How long an invitation link stays valid. */
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Which mail carries the link. `welcome` is the one a staff-registered client
 * gets at the moment of registration — their first contact with us in writing,
 * so it introduces the cabinet rather than just handing over a token (1B-19).
 * `invite` is the plainer re-send, and the one staff accounts get.
 */
export type ClaimInviteKind = 'welcome' | 'invite';

export interface InviteOptions {
  /** Sets (or corrects) the address the invitation goes to. Admin-only. */
  email?: string;
  kind?: ClaimInviteKind;
  /** Named in the mail as the human to ring once the link has expired. */
  consultantName?: string | null;
  /**
   * The staff member who asked for it. Absent for the invitations the system
   * sends itself — registering a client (1B-19) — which are bounded by the
   * flow that triggers them rather than by a role.
   */
  actor?: { role: Role };
}

/**
 * 1B-17 — a staff-created `User` row has no email or password (§4a). This turns
 * it into a login the client owns, without staff ever knowing the password.
 *
 * The raw token exists only inside the emailed link; the database keeps its
 * SHA-256, exactly like `RefreshToken`.
 */
@Injectable()
export class AccountClaimService {
  private readonly logger = new Logger(AccountClaimService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Issues (or re-issues) an invitation and emails the link. */
  async invite(userId: string, options: InviteOptions = {}): Promise<{ expiresAt: Date; emailed: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, password: true, googleId: true },
    });
    if (!user) throw new NotFoundException('Хэрэглэгч олдсонгүй');
    this.assertMayInvite(user.role, options);
    if (user.password) throw new BadRequestException('Энэ бүртгэл аль хэдийн нууц үгтэй байна');
    // A Google sign-in already owns the row; a "set your password" link would
    // invite them to solve a problem they do not have.
    if (user.googleId) throw new BadRequestException('Энэ бүртгэл Google-ээр идэвхжсэн байна');

    const target = (options.email ?? user.email)?.trim().toLowerCase();
    if (!target) throw new BadRequestException('Урилга илгээх имэйл хаяг байхгүй байна');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { email: target, claimTokenHash: sha256(token), claimTokenExpiresAt: expiresAt },
    });

    const link = this.email.link(`/claim?token=${token}`);
    const message = { name: user.name, email: target, link, consultantName: options.consultantName };

    await this.email.send(
      target,
      options.kind === 'welcome' ? clientWelcomeEmail(message) : accountClaimEmail(message),
      options.kind === 'welcome' ? 'account_welcome' : 'account_claim',
    );

    this.logger.log(`Бүртгэл эзэмших урилга илгээлээ: ${target}`);
    return { expiresAt, emailed: true };
  }

  /**
   * 1N-01 — who may aim an invitation at whom.
   *
   * An unclaimed account has no password by design (1B-17), and this call both
   * re-points the address on the row and mails a link that sets one. Together
   * that is a way in: a consultant could point an unclaimed ADMIN row at their
   * own inbox, or re-point a client's login the moment before they claim it.
   *
   * So a consultant may only invite an ordinary client, and only an admin may
   * name an address at all — a consultant's invitation goes to the address the
   * record already carries or nowhere.
   */
  private assertMayInvite(targetRole: Role, options: InviteOptions): void {
    if (!options.actor || options.actor.role === Role.ADMIN) return;

    if (targetRole !== Role.USER) {
      throw new ForbiddenException('Ажилтны бүртгэлд урилга илгээх эрхгүй байна');
    }
    if (options.email !== undefined) {
      throw new ForbiddenException('Урилгын имэйл хаягийг зөвхөн админ өөрчилнө');
    }
  }

  /**
   * The same invitation, sent as a side effect of registering a client (1B-19).
   *
   * Registration must survive a mail outage — the client row is the record of a
   * signed-up person, the invitation is a convenience — so every failure here is
   * logged and swallowed. Staff see the outcome on the client's portal card and
   * can re-send from there.
   */
  async inviteQuietly(userId: string, options: InviteOptions = {}): Promise<void> {
    try {
      await this.invite(userId, options);
    } catch (error) {
      this.logger.warn(`Урилга илгээгдсэнгүй (${userId}): ${String(error)}`);
    }
  }

  /** Consumes the token and sets the password. */
  async claim(token: string, password: string): Promise<{ id: string; email: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { claimTokenHash: sha256(token) },
      select: { id: true, email: true, claimTokenExpiresAt: true, password: true },
    });

    // One message for "wrong token" and "expired token": distinguishing them
    // tells an attacker which half of the guess was right. The page that shows
    // it offers the way back for both — ask your consultant for a new link.
    if (!user || !user.claimTokenExpiresAt || user.claimTokenExpiresAt < new Date()) {
      throw new BadRequestException('Урилгын холбоос хүчингүй эсвэл хугацаа нь дууссан байна');
    }
    if (user.password) throw new BadRequestException('Энэ бүртгэл аль хэдийн идэвхжсэн байна');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(password),
        claimTokenHash: null,
        claimTokenExpiresAt: null,
        claimedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    return updated;
  }
}
