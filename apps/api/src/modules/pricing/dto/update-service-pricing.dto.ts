import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { BalanceTrigger, PrepaymentMode } from '../../../prisma/client.js';

/**
 * Corrects the row that is currently in effect (1C-19) — the typo fix a new
 * version cannot do.
 *
 * `serviceType` and `effectiveFrom` are deliberately absent: moving a row to
 * another service, or to another start date, is a different price change and
 * belongs in `POST /pricing`. Contracts snapshot their amounts when they are
 * signed (`Contract.totalAmountSnapshot`), so correcting a row never disturbs
 * one that is already out with a client.
 */
export class UpdateServicePricingDto {
  @ApiPropertyOptional({ description: 'Total service price, MNT' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  totalAmount?: number;

  @ApiPropertyOptional({ enum: PrepaymentMode })
  @IsEnum(PrepaymentMode)
  @IsOptional()
  prepaymentMode?: PrepaymentMode;

  @ApiPropertyOptional({ description: 'Percent (0-100) if PERCENT, or a fixed MNT amount if FIXED' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  prepaymentValue?: number;

  @ApiPropertyOptional({ enum: BalanceTrigger })
  @IsEnum(BalanceTrigger)
  @IsOptional()
  balanceTrigger?: BalanceTrigger;
}
