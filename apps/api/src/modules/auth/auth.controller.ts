import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AuthService } from './auth.service.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password-reset.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { metaRequestContext } from '../meta/request-context.js';
import { PasswordResetService } from './password-reset.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('register')
  // Every registration sends a welcome mail and pings the office on Slack, so
  // an unthrottled one is a mail cannon pointed at any address someone types.
  // Looser than `login`: a person mistyping their way through a sign-up form
  // is not an attack, and a household behind one NAT address is not either.
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Create an account and start a session' })
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, metaRequestContext(request));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange a Google ID token for a token pair' })
  google(@Body() dto: GoogleLoginDto, @Req() request: Request) {
    return this.auth.loginWithGoogle(dto.idToken, dto.tracking, metaRequestContext(request));
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 3, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Email a password-reset link',
    description:
      'Always 202, whether or not the address is registered — the response must not reveal who has an account.',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.passwordReset.request(dto.email);
    return { ok: true };
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Consume a reset token and set a new password' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.passwordReset.reset(dto.token, dto.password);
  }

  @Post('google/link')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Нэвтэрсэн бүртгэлдээ Google хаяг холбох',
    description:
      'Нууц үгтэй бүртгэлд Google-ийг зөвхөн эндээс холбоно — нэвтэрсэн байх нь бүртгэл өөрийнх '
      + 'гэдгийн баталгаа (1N-03).',
  })
  linkGoogle(@CurrentUser() user: AuthenticatedUser, @Body() dto: GoogleLoginDto) {
    return this.auth.linkGoogle(user.id, dto.idToken);
  }

  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Нэвтэрсэн хэрэглэгч өөрийн нууц үгээ солих',
    description:
      'Одоогийн нууц үгээ баталгаажуулна (Google-ээр нэвтэрдэг, нууц үггүй бүртгэлээс шаардахгүй). '
      + 'Бусад бүх сесс хаагдаж, дуудсан хэрэглэгчид шинэ токен буцаана.',
  })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a fresh token pair' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a single refresh token' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every refresh token for the current user' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logoutAll(user.id);
  }
}
