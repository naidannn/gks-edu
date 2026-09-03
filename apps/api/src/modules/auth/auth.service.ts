import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import type { Role, User } from '../../prisma/client.js';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

const BCRYPT_ROUNDS = 12;

/** `expiresIn` is typed as the `ms` literal union ("15m", "7d", …), not `string`. */
type ExpiresIn = JwtSignOptions['expiresIn'];

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'createdAt' | 'updatedAt'>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSession> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: await hash(dto.password, BCRYPT_ROUNDS),
        name: dto.name,
      },
    });

    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Compare unconditionally so a missing account and a wrong password take
    // roughly the same time, and neither is distinguishable from the response.
    const passwordMatches = user
      ? await compare(dto.password, user.password)
      : await compare(dto.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');

    if (!user || !passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(refreshToken) },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: the presented token is burned as the replacement is issued.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

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
    return createHash('sha256').update(token).digest('hex');
  }
}
