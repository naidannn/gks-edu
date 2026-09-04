import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateDeparturePlanDto {
  @ApiPropertyOptional({ description: 'Явах өдөр — чеклистийн эцсийн хугацаанууд эндээс тооцогдоно' })
  @IsDateString()
  @IsOptional()
  departureAt?: string;

  @ApiPropertyOptional() @IsString() @MaxLength(50) @IsOptional() flightNo?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() arrivalAt?: string;
  @ApiPropertyOptional({ description: 'Сургуулийн тосох үйлчилгээ хүссэн эсэх' })
  @IsBoolean()
  @IsOptional()
  pickupRequested?: boolean;

  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() dormitoryInfo?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() emergencyNote?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() note?: string;
}

export class UpdateChecklistItemDto {
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isDone?: boolean;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() descriptionMn?: string;
}

export class CreateChecklistItemDto {
  @ApiProperty() @IsString() @MaxLength(200) titleMn!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() descriptionMn?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() guideUrl?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(500) @IsOptional() videoUrl?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
