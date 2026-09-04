import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';

/** How long an invitation link stays valid. */
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

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
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /** Issues (or re-issues) an invitation and emails the link. */
  async invite(userId: string, email?: string): Promise<{ expiresAt: Date; emailed: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, password: true },
    });
    if (!user) throw new NotFoundException('Хэрэглэгч олдсонгүй');
    if (user.password) throw new BadRequestException('Энэ бүртгэл аль хэдийн нууц үгтэй байна');

    const target = (email ?? user.email)?.trim().toLowerCase();
    if (!target) throw new BadRequestException('Урилга илгээх имэйл хаяг байхгүй байна');

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + CLAIM_TTL_MS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { email: target, claimTokenHash: sha256(token), claimTokenExpiresAt: expiresAt },
    });

    const base = (this.config.get<string>('notifications.appUrl') ?? '').replace(/\/$/, '');
    const link = `${base}/claim?token=${token}`;

    await this.email.send(
      target,
      'GKSedu.mn — бүртгэлээ идэвхжүүлнэ үү',
      [
        `Сайн байна уу${user.name ? `, ${user.name}` : ''}.`,
        '',
        'GKS EDU GROUP таны нэр дээр үйлчилгээний бүртгэл үүсгэлээ.',
        'Доорх холбоосоор орж нууц үгээ тохируулснаар кабинетдаа нэвтэрч, материалаа',
        'онлайнаар илгээх, төлбөрөө төлөх боломжтой болно.',
        '',
        link,
        '',
        'Холбоос 7 хоногийн дараа хүчингүй болно.',
        '',
        'GKS EDU GROUP',
      ].join('\n'),
    );

    this.logger.log(`Бүртгэл эзэмших урилга илгээлээ: ${target}`);
    return { expiresAt, emailed: true };
  }

  /** Consumes the token and sets the password. */
  async claim(token: string, password: string): Promise<{ id: string; email: string | null }> {
    const user = await this.prisma.user.findUnique({
      where: { claimTokenHash: sha256(token) },
      select: { id: true, email: true, claimTokenExpiresAt: true, password: true },
    });

    // One message for "wrong token" and "expired token": distinguishing them
    // tells an attacker which half of the guess was right.
    if (!user || !user.claimTokenExpiresAt || user.claimTokenExpiresAt < new Date()) {
      throw new BadRequestException('Урилгын холбоос хүчингүй эсвэл хугацаа нь дууссан байна');
    }
    if (user.password) throw new BadRequestException('Энэ бүртгэл аль хэдийн идэвхжсэн байна');

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hash(password, BCRYPT_ROUNDS),
        claimTokenHash: null,
        claimTokenExpiresAt: null,
        claimedAt: new Date(),
      },
      select: { id: true, email: true },
    });

    return updated;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
