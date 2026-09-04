import { Global, Module } from '@nestjs/common';
import { OtpService } from './otp.service.js';
import { SmsService } from './sms.service.js';

@Global()
@Module({
  providers: [SmsService, OtpService],
  exports: [SmsService, OtpService],
})
export class SmsModule {}
