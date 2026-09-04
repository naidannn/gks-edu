import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PaymentKind } from '../../../prisma/client.js';

/** Only these two kinds are ever created through this flow — SCHOOL_TUITION/TRANSFER_FEE/EXTRA_SERVICE belong to later epics (1E/4). */
const CREATABLE_KINDS = [PaymentKind.PREPAYMENT, PaymentKind.BALANCE] as const;

export class CreatePaymentDto {
  @ApiProperty({ enum: CREATABLE_KINDS })
  @IsIn(CREATABLE_KINDS)
  kind!: (typeof CREATABLE_KINDS)[number];
}
