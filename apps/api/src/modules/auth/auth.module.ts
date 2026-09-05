import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordResetService } from './password-reset.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
