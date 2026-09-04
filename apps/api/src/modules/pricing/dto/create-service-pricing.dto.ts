import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsPositive, Min } from 'class-validator';
import { BalanceTrigger, PrepaymentMode, ServiceType } from '../../../prisma/client.js';

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

  @ApiProperty({ description: 'ISO date this pricing takes effect; defaults to now', required: false })
  @IsOptional()
  effectiveFrom?: string;
}
