import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';

interface JwtPayload {
  sub: string;
}

/**
 * Who is asking, when signing in was never required (2B-09).
 *
 * The chat endpoints are `@Public()` — a visitor must be able to ask a question
 * without an account — but a *signed-in* visitor has to be recognised, because
 * their access level is the whole difference between general advice and their
 * own case. The global guard cannot do both: `@Public()` skips it entirely and
 * leaves `req.user` unset even when a perfectly good token was sent.
 *
 * So the token is verified here when one is present, and its absence is an
 * answer rather than an error. An *invalid* token is also not an error: someone
 * whose session expired mid-conversation keeps talking as a guest instead of
 * being thrown out of the widget.
 */
@Injectable()
export class OptionalUserService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('jwt.secret');
  }

  async resolve(request: Request): Promise<AuthenticatedUser | null> {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;

    const token = header.slice(7).trim();
    // The chat's own guest token shares the header and is not a JWT.
    if (token.startsWith('ai_')) return null;

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, { secret: this.secret });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) return null;

      return { id: user.id, email: user.email, role: user.role as Role };
    } catch {
      // Expired or forged: this caller is a guest, not a failure.
      return null;
    }
  }

  /** The chat session token, which travels in the same header as a JWT. */
  static chatToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ai_')) return header.slice(7).trim();

    const explicit = request.headers['x-chat-token'];
    return typeof explicit === 'string' && explicit.startsWith('ai_') ? explicit : null;
  }
}
