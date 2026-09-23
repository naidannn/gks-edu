import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { EssayDocumentStatus, RecommendationStatus } from '../../../prisma/client.js';
import { QUESTIONNAIRE_LEVELS, type QuestionnaireLevel } from '../definitions/index.js';

/**
 * An autosave: only the answers that changed since the last one, merged on the
 * server. An empty string clears an answer. Keys are validated against the
 * question set in the service, not here — the DTO cannot know the level.
 */
export class SaveEssayDto {
  @ApiPropertyOptional({ enum: QUESTIONNAIRE_LEVELS, description: 'Сонгосон түвшин — асуулга эхлэх үед' })
  @IsIn(QUESTIONNAIRE_LEVELS)
  @IsOptional()
  level?: QuestionnaireLevel;

  @ApiPropertyOptional({ description: '{ [questionId]: string } — зөвхөн өөрчлөгдсөн хариултууд' })
  @IsObject()
  @IsOptional()
  answers?: Record<string, string>;
}

export class ReopenEssayDto {
  @ApiProperty({ description: 'Юуг засах, нэмэхийг үйлчлүүлэгчид хэлэх тэмдэглэл' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}

export class CreateRecommendationDto {
  @ApiProperty({ example: 'Б. Сарангэрэл' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  recommenderName!: string;

  @ApiPropertyOptional({ example: 'Математикийн багш' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  relation?: string;

  @ApiPropertyOptional({ description: 'Багшаас асууж өөрөө бөглөнө' })
  @IsBoolean()
  @IsOptional()
  filledByApplicant?: boolean;

  @ApiPropertyOptional({ enum: QUESTIONNAIRE_LEVELS })
  @IsIn(QUESTIONNAIRE_LEVELS)
  @IsOptional()
  level?: QuestionnaireLevel;
}

export class UpdateRecommendationDto {
  @ApiPropertyOptional() @IsString() @IsNotEmpty() @MaxLength(120) @IsOptional() recommenderName?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() relation?: string;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() filledByApplicant?: boolean;

  @ApiPropertyOptional({ description: 'Зөвхөн өөрчлөгдсөн хариултууд' })
  @IsObject()
  @IsOptional()
  answers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Тодорхойлолт өгөгчийн мэдээлэл (V хэсэг)' })
  @IsObject()
  @IsOptional()
  recommender?: Record<string, string>;
}

/** The teacher's autosave through the public link. */
export class SaveRecommendationAnswersDto {
  @ApiPropertyOptional() @IsObject() @IsOptional() answers?: Record<string, string>;
  @ApiPropertyOptional() @IsObject() @IsOptional() recommender?: Record<string, string>;
}

export class SetRecommendationStatusDto {
  @ApiProperty({ enum: RecommendationStatus })
  @IsIn(Object.values(RecommendationStatus))
  status!: RecommendationStatus;

  @ApiPropertyOptional({ description: 'Үйлчлүүлэгчид харагдах тэмдэглэл' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  staffNote?: string;
}

/**
 * The writer's autosave of one essay (1D-28): the whole editor HTML, and the
 * version it was loaded at. A two-page essay is ~10 KB of HTML, well inside
 * Express's 100 KB body limit; the cap keeps a pasted-in Word document with
 * its styling from getting close.
 */
export class SaveEssayDocumentDto {
  @ApiProperty({ description: 'Засварлагчийн HTML' })
  @IsString()
  @MaxLength(80_000)
  html!: string;

  @ApiProperty({ description: 'Засварлагч ачаалсан хувилбар — өөр хүн хадгалсан бол 409' })
  @IsInt()
  @Min(0)
  baseVersion!: number;
}

export class SetEssayDocumentStatusDto {
  @ApiProperty({ enum: EssayDocumentStatus, description: 'Ажилтан: DRAFT | SHARED, үйлчлүүлэгч: APPROVED' })
  @IsIn(Object.values(EssayDocumentStatus))
  status!: EssayDocumentStatus;
}

export class AddEssayCommentDto {
  @ApiProperty({ example: 'Энэ хэсэгт 2023 оны олимпиадыг нэмэх үү?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @ApiPropertyOptional({ description: 'Сэтгэгдэл аль хэсгийн тухай вэ — сонгосон текст' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  quote?: string;
}

export class ResolveEssayCommentDto {
  @ApiProperty() @IsBoolean() resolved!: boolean;
}
