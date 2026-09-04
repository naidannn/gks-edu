import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

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

  @ApiPropertyOptional({ type: [String], example: ['pdf', 'jpg', 'png'] })
  @IsArray()
  @IsString({ each: true })
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
