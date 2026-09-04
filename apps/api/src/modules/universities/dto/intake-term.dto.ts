import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IntakeStatus, ProgramLevel } from '../../../prisma/client.js';

/** The Korean academic intake months — language prep runs four a year, degrees two. */
export const INTAKE_MONTHS = [3, 6, 9, 12] as const;

export class CreateIntakeTermDto {
  @ApiProperty({ enum: ProgramLevel })
  @IsEnum(ProgramLevel)
  level!: ProgramLevel;

  @ApiProperty({ example: 2027 })
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;

  @ApiProperty({ enum: INTAKE_MONTHS, description: '3, 6, 9 or 12' })
  @Type(() => Number)
  @IsIn(INTAKE_MONTHS)
  month!: number;

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsDateString()
  @IsOptional()
  applicationDeadline?: string | null;

  @ApiPropertyOptional({ enum: IntakeStatus, default: IntakeStatus.PLANNED })
  @IsEnum(IntakeStatus)
  @IsOptional()
  status?: IntakeStatus;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string | null;
}

export class UpdateIntakeTermDto extends PartialType(CreateIntakeTermDto) {}
