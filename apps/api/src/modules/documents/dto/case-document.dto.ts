import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { DocStage, DocumentStatus, Necessity } from '../../../prisma/client.js';

export class TransitionDocumentDto {
  @ApiProperty({ enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  toStatus!: DocumentStatus;

  @ApiPropertyOptional({ description: 'Хэрэглэгчид харагдах тайлбар' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

/** The three review verdicts of gksedu.md §6.3 (1D-09). */
export enum ReviewAction {
  ACCEPT = 'ACCEPT',
  REQUEST_FIX = 'REQUEST_FIX',
  RETURN = 'RETURN',
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: ReviewAction })
  @IsEnum(ReviewAction)
  action!: ReviewAction;

  @ApiPropertyOptional({ description: 'REQUEST_FIX / RETURN үед заавал — юуг яагаад засахыг бичнэ' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

export class AddDocumentNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ description: 'Зөвхөн ажилтанд харагдана' })
  @IsOptional()
  isInternal?: boolean;
}

/**
 * A material typed straight onto one client's checklist (1D-22) — something a
 * school asked for that no template covers yet.
 *
 * It is saved as a `DocumentTemplate` and stays one: the next client who needs
 * the same paper is given it from the picker instead of having it retyped. No
 * `RequirementRule` ever points at it, so the engine will not start issuing it
 * to everybody on its own.
 */
export class NewDocumentTemplateDto {
  @ApiProperty({ example: 'Банкны тодорхойлолт' })
  @IsString()
  @MaxLength(200)
  nameMn!: string;

  @ApiPropertyOptional({ description: 'Юу гэсэн материал болох, ямар шаардлага тавигдаж буй' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  descriptionMn?: string;

  @ApiPropertyOptional({ example: 'Банкнаас', description: 'Хаанаас авах вэ' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  sourceHint?: string;

  @ApiPropertyOptional({ description: 'Хэн баталгаажуулдаг вэ' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  issuerHint?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsTranslation?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsNotary?: boolean;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() needsApostille?: boolean;
  @ApiPropertyOptional({ description: '"Эх хувиар авчрах" — оффист авчрах материал' })
  @IsBoolean()
  @IsOptional()
  needsPhysicalOriginal?: boolean;

  @ApiPropertyOptional({ description: 'Зөвлөмж — хэрэглэгчид харагдана' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  tipsMn?: string;
}

export class CreateCaseDocumentDto {
  @ApiPropertyOptional({ description: 'Байгаа загвараас сонгосон бол' })
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({ type: NewDocumentTemplateDto, description: 'Шинэ материал бичих бол — загвар болж хадгалагдана' })
  @ValidateNested()
  @Type(() => NewDocumentTemplateDto)
  @IsOptional()
  template?: NewDocumentTemplateDto;

  @ApiProperty({ enum: DocStage })
  @IsEnum(DocStage)
  stage!: DocStage;

  @ApiPropertyOptional({ enum: Necessity })
  @IsEnum(Necessity)
  @IsOptional()
  necessity?: Necessity;

  @ApiPropertyOptional() @IsString() @MaxLength(300) @IsOptional() conditionNote?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
}

export class UpdateCaseDocumentDto {
  @ApiPropertyOptional({ enum: Necessity })
  @IsEnum(Necessity)
  @IsOptional()
  necessity?: Necessity;

  @ApiPropertyOptional({ description: 'Эцсийн хугацаа — D-7/D-3/D-1 сануулга үүсгэнэ (1D-12)' })
  @IsDateString()
  @IsOptional()
  dueAt?: string;

  @ApiPropertyOptional() @IsString() @MaxLength(300) @IsOptional() conditionNote?: string;
}

/** Staff review queue (1D-16). */
export class QueryCaseDocumentsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DocStage })
  @IsEnum(DocStage)
  @IsOptional()
  stage?: DocStage;

  @ApiPropertyOptional({ enum: DocumentStatus })
  @IsEnum(DocumentStatus)
  @IsOptional()
  status?: DocumentStatus;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @ApiPropertyOptional({ description: 'Тухайн баримт хариуцагчид хуваарилагдсан үйлчилгээнүүд' })
  @IsUUID()
  @IsOptional()
  assignedDocOfficerId?: string;

  @ApiPropertyOptional({ description: 'Хэрэг/хэрэглэгчийн нэрээр хайх' })
  @IsString()
  @IsOptional()
  q?: string;
}
