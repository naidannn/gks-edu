import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
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

export class CreateCaseDocumentDto {
  @ApiProperty() @IsUUID() templateId!: string;

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

  @ApiPropertyOptional({ description: 'Тухайн баримт хариуцагчид хуваарилагдсан хэргүүд' })
  @IsUUID()
  @IsOptional()
  assignedDocOfficerId?: string;

  @ApiPropertyOptional({ description: 'Хэрэг/хэрэглэгчийн нэрээр хайх' })
  @IsString()
  @IsOptional()
  q?: string;
}
