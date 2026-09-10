import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { InvoiceItemKind, SchoolInvoiceStatus } from '../../../prisma/client.js';

export class SchoolInvoiceItemDto {
  @ApiProperty({ enum: InvoiceItemKind })
  @IsEnum(InvoiceItemKind)
  kind!: InvoiceItemKind;

  @ApiProperty({ example: 'Хоёр улирлын сургалтын төлбөр' })
  @IsString()
  @MaxLength(200)
  labelMn!: string;

  @ApiProperty({ description: 'Воны дүн' })
  @IsNumber()
  @Min(0)
  amountKrw!: number;
}

export class CreateSchoolInvoiceDto {
  @ApiProperty({ type: [SchoolInvoiceItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SchoolInvoiceItemDto)
  items!: SchoolInvoiceItemDto[];

  @ApiPropertyOptional({ description: 'Хоосон бол тухайн өдрийн Монголбанкны ханшийг авна (1E-07)' })
  @IsNumber()
  // A rate of 0 snapshots the whole invoice at 0₮ — the client is then told to
  // pay nothing for a bill the school will still chase (1N-26).
  @IsPositive()
  @IsOptional()
  fxRate?: number;

  @ApiPropertyOptional({ description: 'Шилжүүлгийн үйлчилгээний шимтгэл (₮)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  transferFeeMnt?: number;

  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

export class UpdateSchoolInvoiceDto {
  @ApiPropertyOptional({ enum: SchoolInvoiceStatus })
  @IsEnum(SchoolInvoiceStatus)
  @IsOptional()
  status?: SchoolInvoiceStatus;

  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() paidAt?: string;
  @ApiPropertyOptional({ description: 'Сургууль төлбөрийг хүлээн авсан огноо' })
  @IsDateString()
  @IsOptional()
  receivedBySchoolAt?: string;

  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}

/** 1E-09 — the invitation letter that opens the visa stage. */
export class CreateInvitationDto {
  @ApiPropertyOptional() @IsString() @MaxLength(100) @IsOptional() number?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() issuedAt?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}
