import { Global, Module } from '@nestjs/common';
import { OtpService } from './otp.service.js';

/** Global for the same reason `SmsModule` is: whoever needs a code asks. */
@Global()
@Module({
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
