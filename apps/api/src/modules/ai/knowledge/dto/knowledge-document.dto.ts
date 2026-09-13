import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AccessLevel,
  KnowledgeCategory,
  KnowledgeKind,
  KnowledgeStatus,
  ServiceType,
} from '../../../../prisma/client.js';
import { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';

/**
 * Writing a knowledge document by hand — an answer card (`ENTRY`) or a sales
 * playbook (`PLAYBOOK`). `FILE` documents arrive through the upload route
 * instead, and `FAQ`/`POST` are mirrored by the sync listener (2A-07), never
 * typed here.
 */
export class CreateKnowledgeDocumentDto {
  @ApiProperty({ example: 'GKS-ийн мэдүүлгийн хугацаа яагаад эрт вэ' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ enum: KnowledgeKind })
  @IsEnum(KnowledgeKind)
  kind!: KnowledgeKind;

  @ApiProperty({ enum: KnowledgeCategory })
  @IsEnum(KnowledgeCategory)
  category!: KnowledgeCategory;

  @ApiPropertyOptional({ enum: AccessLevel, default: AccessLevel.PUBLIC })
  @IsEnum(AccessLevel)
  @IsOptional()
  accessLevel?: AccessLevel;

  @ApiPropertyOptional({ enum: KnowledgeStatus, default: KnowledgeStatus.DRAFT })
  @IsEnum(KnowledgeStatus)
  @IsOptional()
  status?: KnowledgeStatus;

  @ApiPropertyOptional({ description: 'Set when the document is about one school' })
  @IsUUID()
  @IsOptional()
  universityId?: string | null;

  @ApiPropertyOptional({ enum: ServiceType })
  @IsEnum(ServiceType)
  @IsOptional()
  serviceType?: ServiceType | null;

  @ApiPropertyOptional({
    description: 'ISO date after which the document leaves search on its own — use it on anything dated',
  })
  @IsDateString()
  @IsOptional()
  validUntil?: string | null;

  @ApiPropertyOptional({ description: 'ENTRY: the visitor question this card answers' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  question?: string | null;

  @ApiPropertyOptional({ description: 'The text itself — required for everything but FILE' })
  @IsString()
  @MaxLength(20_000)
  @IsOptional()
  body?: string | null;
}

export class UpdateKnowledgeDocumentDto extends PartialType(CreateKnowledgeDocumentDto) {}

export class QueryKnowledgeDocumentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches the title, question or body' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: KnowledgeKind })
  @IsEnum(KnowledgeKind)
  @IsOptional()
  kind?: KnowledgeKind;

  @ApiPropertyOptional({ enum: KnowledgeCategory })
  @IsEnum(KnowledgeCategory)
  @IsOptional()
  category?: KnowledgeCategory;

  @ApiPropertyOptional({ enum: AccessLevel })
  @IsEnum(AccessLevel)
  @IsOptional()
  accessLevel?: AccessLevel;

  @ApiPropertyOptional({ enum: KnowledgeStatus })
  @IsEnum(KnowledgeStatus)
  @IsOptional()
  status?: KnowledgeStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({ description: 'Only documents whose indexing failed' })
  @IsOptional()
  failedOnly?: string;

  @ApiPropertyOptional({ description: 'Only documents whose `validUntil` has passed' })
  @IsOptional()
  staleOnly?: string;
}

/** "Test the search" on the admin screen (2E-01) and the retrieval unit tests. */
export class SearchKnowledgeDto {
  @ApiProperty({ example: 'Дотуур байр байдаг уу' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({
    enum: AccessLevel,
    description: 'Search as a caller at this level — staff use it to see what a visitor would get',
  })
  @IsEnum(AccessLevel)
  @IsOptional()
  accessLevel?: AccessLevel;

  @ApiPropertyOptional({ minimum: 1, default: 8 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;
}
