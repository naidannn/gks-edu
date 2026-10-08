import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { FacebookAiMode, FacebookCommentStatus } from '../../../prisma/client.js';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export const FACEBOOK_THREAD_SCOPES = ['NEEDS_STAFF', 'ALL', 'AI', 'UNLINKED'] as const;
export type FacebookThreadScope = (typeof FACEBOOK_THREAD_SCOPES)[number];

export class QueryFacebookThreadsDto {
  @ApiPropertyOptional({ enum: FACEBOOK_THREAD_SCOPES, default: 'NEEDS_STAFF' })
  @IsIn(FACEBOOK_THREAD_SCOPES)
  @IsOptional()
  scope?: FacebookThreadScope;

  @ApiPropertyOptional({ description: 'Нэр, утас, мессежийн эхлэлээр' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(trim)
  search?: string;

  @ApiPropertyOptional({ description: 'Энэ сэжимтэй холбоотой чатууд' })
  @IsUUID()
  @IsOptional()
  leadId?: string;

  @ApiPropertyOptional({ description: 'Энэ үйлчлүүлэгчтэй холбоотой чатууд' })
  @IsUUID()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class SendFacebookMessageDto {
  @ApiProperty({ maxLength: 2000, description: 'Messenger нэг мессежинд 2000 тэмдэгт хүлээж авна' })
  @IsString()
  @Length(1, 2000)
  @Transform(trim)
  text!: string;
}

export class SetFacebookAiDto {
  @ApiPropertyOptional({ enum: FacebookAiMode })
  @IsEnum(FacebookAiMode)
  @IsOptional()
  mode?: FacebookAiMode;

  @ApiPropertyOptional({ description: 'Ажилтан бичсэний дараах түр зогсолтыг цуцлах' })
  @Equals(true)
  @IsOptional()
  resume?: true;
}

export class LinkFacebookThreadDto {
  @ApiPropertyOptional({ nullable: true, description: 'null = салгах' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @IsOptional()
  leadId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = салгах' })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @IsOptional()
  clientId?: string | null;
}

export class CreateLeadFromThreadDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  @Transform(trim)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  @Transform(trim)
  lastName!: string;

  @ApiProperty({ example: '99112233' })
  @IsString()
  @Matches(/^\+?[0-9 -]{8,15}$/, { message: 'Утасны дугаар буруу байна' })
  @Transform(trim)
  phone!: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @Transform(trim)
  note?: string;
}

export class QueryLinkCandidatesDto {
  @ApiProperty({ minLength: 2 })
  @IsString()
  @Length(2, 100)
  @Transform(trim)
  search!: string;
}

export class QueryFacebookCommentsDto {
  @ApiPropertyOptional({ enum: FacebookCommentStatus })
  @IsEnum(FacebookCommentStatus)
  @IsOptional()
  status?: FacebookCommentStatus;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number;
}

export class ReplyFacebookCommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  @Transform(trim)
  text!: string;

  @ApiProperty({ description: 'true = Messenger-ээр (private reply), false = сэтгэгдлийн доор нийтэд' })
  @IsBoolean()
  private!: boolean;
}
