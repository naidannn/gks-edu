import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { BalanceTrigger, PrepaymentMode, ServiceType } from '../../../prisma/client.js';
import { DEFAULT_PAYMENT_DUE_DAYS, MAX_PAYMENT_DUE_DAYS } from '../payment-terms.js';

export class CreateServicePricingDto {
  @ApiProperty({ enum: ServiceType })
  @IsEnum(ServiceType)
  serviceType!: ServiceType;

  @ApiProperty({ description: 'Total service price, MNT' })
  @IsNumber()
  @IsPositive()
  totalAmount!: number;

  @ApiProperty({ enum: PrepaymentMode })
  @IsEnum(PrepaymentMode)
  prepaymentMode!: PrepaymentMode;

  @ApiProperty({ description: 'Percent (0-100) if PERCENT, or a fixed MNT amount if FIXED' })
  @IsNumber()
  @Min(0)
  prepaymentValue!: number;

  @ApiProperty({ enum: BalanceTrigger })
  @IsEnum(BalanceTrigger)
  balanceTrigger!: BalanceTrigger;

  @ApiPropertyOptional({
    description: 'Days a client is given to pay an invoice raised under this pricing (drives Payment.dueAt)',
    default: DEFAULT_PAYMENT_DUE_DAYS,
  })
  @IsInt()
  @Min(1)
  @Max(MAX_PAYMENT_DUE_DAYS)
  @IsOptional()
  paymentDueDays?: number;

  @ApiProperty({ description: 'ISO date this pricing takes effect; defaults to now', required: false })
  @IsOptional()
  effectiveFrom?: string;
}
