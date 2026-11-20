import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/** What a template may ask for; a photo sent for a PDF-only template becomes a PDF (1D-32). */
export const DOCUMENT_FILE_TYPES = ['pdf', 'jpg', 'png'] as const;

export class CreateDocumentTemplateDto {
  @ApiProperty({ example: 'PASSPORT', description: 'Stable machine code — SCREAMING_SNAKE' })
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,63}$/, { message: 'Код нь том латин үсэг, тоо, доогуур зураас байх ёстой' })
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  nameMn!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  descriptionMn?: string;

  @ApiPropertyOptional({ example: 'E-Mongolia-аас' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  sourceHint?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  issuerHint?: string;

  @ApiPropertyOptional({ description: 'Хүчинтэй хугацаа (хоног); хоосон = хугацаагүй' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  validityDays?: number;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsTranslation?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsNotary?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsApostille?: boolean;
  @ApiPropertyOptional({ description: '"Эх хувиар авчрах" — оффист авчрах материал' })
  @IsBoolean()
  @IsOptional()
  needsPhysicalOriginal?: boolean;

  @ApiPropertyOptional({ type: [String], enum: DOCUMENT_FILE_TYPES, example: ['pdf'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(DOCUMENT_FILE_TYPES, { each: true })
  @IsOptional()
  acceptedFileTypes?: string[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  tipsMn?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateDocumentTemplateDto extends PartialType(CreateDocumentTemplateDto) {}
