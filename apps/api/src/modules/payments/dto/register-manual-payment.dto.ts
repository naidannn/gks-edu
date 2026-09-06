import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentKind, PaymentMethod } from '../../../prisma/client.js';

/** Same two kinds the QPay flow creates — a manual row must be one of the payments the case flow knows how to advance on. */
const CREATABLE_KINDS = [PaymentKind.PREPAYMENT, PaymentKind.BALANCE] as const;

/** QPay is never registered by hand: it either went through the invoice flow or it did not happen (1C-27). */
const MANUAL_METHODS = [PaymentMethod.BANK_TRANSFER, PaymentMethod.CARD, PaymentMethod.CASH] as const;

export class RegisterManualPaymentDto {
  @ApiProperty({ enum: CREATABLE_KINDS })
  @IsIn(CREATABLE_KINDS)
  kind!: (typeof CREATABLE_KINDS)[number];

  @ApiProperty({ enum: MANUAL_METHODS })
  @IsIn(MANUAL_METHODS)
  method!: (typeof MANUAL_METHODS)[number];

  @ApiProperty({ description: 'When the money actually arrived — not when it was typed in' })
  @IsDateString()
  paidAt!: string;

  @ApiPropertyOptional({ description: 'Bank transaction number or POS slip number this was matched against' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;
}
