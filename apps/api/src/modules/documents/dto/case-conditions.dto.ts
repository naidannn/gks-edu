import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EducationLevel, GuarantorRelation, GuarantorType } from '../../../prisma/client.js';

/** The questionnaire that drives rule resolution (1D-06). */
export class UpsertCaseConditionsDto {
  @ApiPropertyOptional({ enum: EducationLevel })
  @IsEnum(EducationLevel)
  @IsOptional()
  educationLevel?: EducationLevel;

  @ApiPropertyOptional({ enum: GuarantorType })
  @IsEnum(GuarantorType)
  @IsOptional()
  guarantorType?: GuarantorType;

  @ApiPropertyOptional({ enum: GuarantorRelation, description: 'Эцэг эх биш бол төрөл садангийн лавлагаа нэмэгдэнэ' })
  @IsEnum(GuarantorRelation)
  @IsOptional()
  guarantorRelation?: GuarantorRelation;

  @ApiPropertyOptional() @IsString() @MaxLength(200) @IsOptional() guarantorName?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(40) @IsOptional() guarantorPhone?: string;
  @ApiPropertyOptional() @IsString() @MaxLength(1000) @IsOptional() note?: string;
}
