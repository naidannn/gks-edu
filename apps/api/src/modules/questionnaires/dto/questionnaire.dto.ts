import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { RecommendationStatus } from '../../../prisma/client.js';
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
