import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { DocStage, EducationLevel, GuarantorRelation, GuarantorType, Necessity, ServiceType } from '../../../prisma/client.js';

export class CreateRequirementRuleDto {
  @ApiProperty() @IsUUID() templateId!: string;

  @ApiProperty({ enum: DocStage })
  @IsEnum(DocStage)
  stage!: DocStage;

  @ApiPropertyOptional({ enum: ServiceType, isArray: true, description: 'Хоосон = бүх үйлчилгээнд' })
  @IsArray()
  @IsEnum(ServiceType, { each: true })
  @IsOptional()
  serviceTypes?: ServiceType[];

  @ApiPropertyOptional({ enum: EducationLevel, isArray: true, description: 'Хоосон = бүх түвшинд' })
  @IsArray()
  @IsEnum(EducationLevel, { each: true })
  @IsOptional()
  educationLevels?: EducationLevel[];

  @ApiPropertyOptional({ enum: GuarantorType, isArray: true, description: 'Хоосон = батлан даагчийн төрлөөс үл хамаарна' })
  @IsArray()
  @IsEnum(GuarantorType, { each: true })
  @IsOptional()
  guarantorTypes?: GuarantorType[];

  @ApiPropertyOptional({ enum: GuarantorRelation, isArray: true })
  @IsArray()
  @IsEnum(GuarantorRelation, { each: true })
  @IsOptional()
  guarantorRelations?: GuarantorRelation[];

  @ApiPropertyOptional({ description: 'Хоосон = бүх сургуульд (1D-18)' })
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({ enum: Necessity })
  @IsEnum(Necessity)
  @IsOptional()
  necessity?: Necessity;

  @ApiPropertyOptional({ example: 'байгаа тохиолдолд' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  conditionNote?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateRequirementRuleDto extends PartialType(CreateRequirementRuleDto) {}

export class QueryRequirementRulesDto {
  @ApiPropertyOptional({ enum: DocStage })
  @IsEnum(DocStage)
  @IsOptional()
  stage?: DocStage;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Тухайн сургуулийн тусгай шаардлагууд' })
  @IsUUID()
  @IsOptional()
  universityId?: string;
}
