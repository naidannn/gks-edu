import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { NotificationEvent, type Role, type User } from '../../prisma/client.js';
import { compare } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { hashPassword, sha256 } from '../../common/utils/hashing.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import type { MetaTrackingDto } from '../meta/dto/meta-tracking.dto.js';
import { MetaEventsService } from '../meta/meta-events.service.js';
import type { MetaRequestContext } from '../meta/request-context.js';
import type { ChangePasswordDto } from './dto/password-reset.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

/** One wording for every "your session is over" case — see {@link AuthService.refresh}. */
const SESSION_OVER = 'Сесс дууссан эсвэл хүчингүй байна. Дахин нэвтэрнэ үү';

/** `expiresIn` is typed as the `ms` literal union ("15m", "7d", …), not `string`. */
type ExpiresIn = JwtSignOptions['expiresIn'];

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt' | 'updatedAt'>;
}

@Injectable()
export class AuthService {
  /** Built on first use so a deployment without GOOGLE_CLIENT_ID still boots. */
  private googleClient?: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly slack: SlackService,
    private readonly meta: MetaEventsService,
  ) {}

  async register(dto: RegisterDto, request: MetaRequestContext = {}): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Энэ и-мэйлээр бүртгэл аль хэдийн үүссэн байна');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await hashPassword(dto.password),
        name: dto.name,
      },
    });

    await this.welcome(user, 'И-мэйл, нууц үг');
    await this.reportRegistrationToMeta(user, 'password', dto.tracking, request);
    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Compare unconditionally so a missing account and a wrong password take
    // roughly the same time, and neither is distinguishable from the response.
    const passwordMatches = user?.password
      ? await compare(dto.password, user.password)
      : await compare(dto.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('И-мэйл эсвэл нууц үг буруу байна');
    }

    return this.issueSession(user);
  }

  /**
   * Google Identity Services signs the user in on the browser and hands it an ID
   * token; this verifies that token against our own client id and turns it into
   * one of our sessions. There is no password involved either way — a row that
   * only ever signs in with Google keeps `password: null`.
   *
   * The delicate part is what happens when the Google id is new but the address
   * is already on a row — see {@link assertLinkable}.
   */
  async loginWithGoogle(
    idToken: string,
    tracking?: MetaTrackingDto,
    request: MetaRequestContext = {},
  ): Promise<AuthSession> {
    const { googleId, email, name } = await this.verifyGoogleToken(idToken);

    const linked = await this.prisma.user.findUnique({ where: { googleId } });
    const user =
      linked ??
      // Case-insensitive, because a staff-typed address ("Bat@Gmail.com") must
      // still match the lower-cased one Google returns instead of forking a
      // second account on the same inbox.
      (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }));

    if (!user) {
      const created = await this.prisma.user.create({
        data: { email, googleId, name: name ?? null },
      });
      await this.welcome(created, 'Google');
      // Only the branch that actually creates a row reports the conversion —
      // an existing user signing in with Google is a login, not a registration.
      await this.reportRegistrationToMeta(created, 'google', tracking, request);
      return this.issueSession(created);
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Энэ бүртгэл идэвхгүй байна');
    }

    if (!linked) this.assertLinkable(user);

    if (user.googleId === googleId && user.name) {
      return this.issueSession(user);
    }

    return this.issueSession(await this.attachGoogleId(user, googleId, name));
  }

  /**
   * Attaching a Google identity to an account found only by its address (1N-03).
   *
   * Matching the inbox is not proof of owning it, because registration verifies
   * nothing: anyone may open an account on any address with a password of their
   * choosing. Linking on the address alone therefore let an attacker register
   * a victim's address, wait for the victim to press "Google-ээр нэвтрэх", and
   * land them inside the attacker's account — password still attached, and now
   * holding everything the victim goes on to upload.
   *
   * A row with **no password** is the safe case and the one this was built for:
   * staff create client logins without one (1B-14, 1B-17), so nobody has ever
   * claimed it and Google's verified address is the first proof of ownership
   * anyone has offered. A row that has a password was opened by someone who
   * chose it, and only they can say the account is theirs — so they say it
   * once, by signing in with it.
   *
   * A row that already carries a *different* Google id is refused too: whoever
   * linked it first is the owner, and quietly re-pointing the row at a second
   * Google account would hand it over.
   */
  private assertLinkable(user: Pick<User, 'password' | 'googleId'>): void {
    if (user.googleId) {
      throw new ConflictException('Энэ и-мэйлд өөр Google хаяг холбогдсон байна');
    }
    if (user.password) {
      throw new ConflictException(
        'Энэ и-мэйлээр нууц үгтэй бүртгэл байна. Нэг удаа нууц үгээрээ нэвтэрч, дараа нь Google-ээ холбоно уу',
      );
    }
  }

  /**
   * Adds Google to an account the caller has already proved is theirs, by being
   * signed in to it. The other half of {@link assertLinkable}: it is the "once"
   * in "sign in with your password once".
   */
  async linkGoogle(userId: string, idToken: string): Promise<{ linked: true }> {
    const { googleId, email } = await this.verifyGoogleToken(idToken);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Энэ бүртгэл идэвхгүй байна');
    if (user.googleId && user.googleId !== googleId) {
      throw new ConflictException('Энэ бүртгэлд өөр Google хаяг холбогдсон байна');
    }

    const clash = await this.prisma.user.findUnique({ where: { googleId }, select: { id: true } });
    if (clash && clash.id !== userId) {
      throw new ConflictException('Энэ Google хаяг өөр бүртгэлд холбогдсон байна');
    }

    // The address is not overwritten: the Google account proves who is holding
    // it, not where our mail should go — that stays an office decision (1N-03).
    if (!user.googleId) await this.attachGoogleId(user, googleId, user.name ?? email);

    return { linked: true };
  }

  /** Writes the Google id, and settles an outstanding claim invitation with it. */
  private attachGoogleId(user: User, googleId: string, name?: string | null): Promise<User> {
    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        googleId,
        name: user.name ?? name ?? null,
        // Signing in with Google settles an outstanding claim invitation the
        // same way setting a password does (1B-17).
        ...(user.claimTokenHash
          ? { claimTokenHash: null, claimTokenExpiresAt: null, claimedAt: user.claimedAt ?? new Date() }
          : {}),
      },
    });
  }

  /** Verifies an ID token against our own client id and reads the identity out of it. */
  private async verifyGoogleToken(
    idToken: string,
  ): Promise<{ googleId: string; email: string; name?: string }> {
    const clientId = this.config.get<string>('google.clientId');
    if (!clientId) {
      throw new ServiceUnavailableException('Google-ээр нэвтрэх тохиргоо хийгдээгүй байна');
    }

    this.googleClient ??= new OAuth2Client(clientId);

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Google-ийн баталгаа хүчингүй байна');
    }

    // `email_verified` is the floor: without it a Google account could name an
    // inbox it never proved it owns. It is necessary, not sufficient — see
    // `assertLinkable` for what our own side still has to be sure of.
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google баталгаажсан и-мэйл хаяг буцаасангүй');
    }

    return { googleId: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name };
  }

  /**
   * Changing your own password while signed in. Two things make it different
   * from the emailed reset: the current password is the proof of identity, and
   * the session doing the changing survives. Everything else is cut off: the
   * old password can not keep a forgotten browser logged in, so every refresh
   * token is revoked and this caller gets a fresh pair.
   *
   * An account with **no** password cannot use this route at all (1N-43). It
   * used to be allowed to set one with nothing to prove, which made a leaked
   * fifteen-minute access token into a permanent credential — and, because the
   * change revokes every session, one that locked the real owner out on the way
   * in. Proof has to come from outside the session, so those accounts go
   * through the emailed invitation (1B-17) or the reset link instead; both
   * require the inbox.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Энэ бүртгэл идэвхгүй байна');
    }

    if (!user.password) {
      throw new BadRequestException(
        user.googleId
          ? 'Энэ бүртгэл Google-ээр нэвтэрдэг тул эндээс нууц үг тохируулах боломжгүй'
          : 'Нууц үгээ и-мэйлээр ирсэн урилга эсвэл "Нууц үгээ мартсан" холбоосоор тохируулна уу',
      );
    }

    const matches = dto.currentPassword ? await compare(dto.currentPassword, user.password) : false;
    if (!matches) {
      throw new UnauthorizedException('Одоогийн нууц үг буруу байна');
    }
    if (await compare(dto.newPassword, user.password)) {
      throw new BadRequestException('Шинэ нууц үг хуучнаасаа өөр байх ёстой');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: await hashPassword(dto.newPassword),
        // Setting a password settles any outstanding invitation, exactly as
        // claiming it would have (1B-17).
        claimTokenHash: null,
        claimTokenExpiresAt: null,
        claimedAt: user.claimedAt ?? new Date(),
      },
    });

    await this.logoutAll(userId);
    return this.issueSession(updated);
  }

  /**
   * Rotates a refresh token, with reuse detection (1N-43).
   *
   * Two things make this different from a read-then-revoke pair. First, **the
   * revoke is the claim**: one `updateMany` narrowed to the un-revoked row is a
   * single atomic statement, so two concurrent refreshes of the same token
   * cannot both succeed — exactly one wins, and the loser is indistinguishable
   * from a replay. Second, a miss on a row that *is* already revoked is treated
   * as theft rather than shrugged off: the presented token was burned once
   * already, so either someone copied it or the real client raced itself, and
   * from here nobody can tell which. Every session on the account goes, the
   * owner signs in again, and a stolen token is worth nothing.
   *
   * (0-19 plans to move refresh tokens into httpOnly cookies. That changes
   * where the token lives, not any of this.)
   */
  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException(SESSION_OVER);
    }

    const tokenHash = this.hashToken(refreshToken);
    const now = new Date();

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    if (claimed.count === 0) {
      const spent = await this.prisma.refreshToken.findUnique({
        where: { tokenHash },
        select: { userId: true, revokedAt: true },
      });
      // Only a *revoked* row is reuse. A merely expired one is time passing.
      if (spent?.revokedAt) await this.logoutAll(spent.userId);
      throw new UnauthorizedException(SESSION_OVER);
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // The account can have been deactivated since the token was issued — an
    // access token lives fifteen minutes, a refresh token days.
    if (!stored || stored.userId !== payload.sub || !stored.user.isActive) {
      throw new UnauthorizedException(SESSION_OVER);
    }

    return this.issueSession(stored.user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * The first email of the journey (§16), plus the office's Slack ping — both
   * registration paths (password and Google) land here. It goes through the
   * dispatcher like every other notification — so it lands in the in-app
   * centre too, and an admin can reword it — and neither `dispatch` nor
   * `notify` throws, so a mail or Slack outage can not fail a registration.
   *
   * @param via How the account was opened — the one thing the office cannot
   *            read off the row itself.
   */
  private async welcome(user: Pick<User, 'id' | 'email' | 'name'>, via: string): Promise<void> {
    await this.notifications.dispatch({
      event: NotificationEvent.ACCOUNT_CREATED,
      userIds: [user.id],
      context: { clientName: user.name ?? 'Эрхэм харилцагч', userEmail: user.email },
    });

    await this.slack.notify({
      emoji: '🙋',
      title: 'Шинэ хэрэглэгч бүртгүүлсэн',
      fields: [
        { label: 'Нэр', value: user.name },
        { label: 'И-мэйл', value: user.email },
        { label: 'Бүртгэлийн хэлбэр', value: via },
      ],
      // No link: a fresh account has no `Client` row yet, and the admin list
      // has no URL-driven search to point at. The address above is the handle.
    });
  }

  /**
   * `CompleteRegistration` (1A-38) — both sign-up paths land here, and only
   * when a row was genuinely created.
   *
   * The `event_id` is the browser's when it sent one. The Google button is the
   * awkward case: the browser cannot know in advance whether the click will
   * create an account or just sign an existing one in, so it fires nothing and
   * the user id becomes the id instead — a server-only event, deduplicated
   * against a repeated request rather than against a browser twin.
   */
  private async reportRegistrationToMeta(
    user: Pick<User, 'id' | 'email' | 'name'>,
    method: 'password' | 'google',
    tracking: MetaTrackingDto | undefined,
    request: MetaRequestContext,
  ): Promise<void> {
    // `User.name` is one field holding whatever the person typed; splitting it
    // on the first space is the best guess available and a wrong guess only
    // costs one matching signal.
    const [firstName, ...rest] = (user.name ?? '').trim().split(/\s+/).filter(Boolean);

    await this.meta.track({
      eventName: 'CompleteRegistration',
      eventId: tracking?.eventId || user.id,
      actionSource: 'website',
      eventSourceUrl: tracking?.eventSourceUrl,
      identity: {
        email: user.email,
        firstName,
        lastName: rest.join(' ') || undefined,
        country: 'mn',
        externalIds: [user.id, tracking?.externalId],
        fbp: tracking?.fbp,
        fbc: tracking?.fbc,
        ...request,
      },
      customData: { content_name: 'Бүртгэл', status: method },
    });
  }

  private async issueSession(user: User): Promise<AuthSession> {
    const payload = { sub: user.id, email: user.email, role: user.role as Role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('jwt.secret'),
      expiresIn: this.config.getOrThrow<string>('jwt.expiresIn') as ExpiresIn,
    });

    const refreshExpiresIn = this.config.getOrThrow<string>('jwt.refreshExpiresIn');
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, jti: randomBytes(16).toString('hex') },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: refreshExpiresIn as ExpiresIn,
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  private hashToken(token: string): string {
    return sha256(token);
  }
}
