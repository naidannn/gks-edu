import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import {
  CampaignRecipientStatus,
  ClientStatus,
  EmailCampaignStatus,
  LeadSource,
  LeadStage,
  MarketingAudience,
  ServiceType,
  SubscriberStatus,
} from '../../../prisma/client.js';

const TONES = ['info', 'success', 'warning', 'critical'] as const;

/** How an audience is narrowed. Every field is optional — none means "all of them". */
export class MarketingFiltersDto {
  @IsOptional() @IsArray() @IsEnum(LeadStage, { each: true }) leadStages?: LeadStage[];
  @IsOptional() @IsArray() @IsEnum(LeadSource, { each: true }) leadSources?: LeadSource[];
  @IsOptional() @IsArray() @IsEnum(ClientStatus, { each: true }) clientStatuses?: ClientStatus[];
  @IsOptional() @IsArray() @IsEnum(ServiceType, { each: true }) serviceTypes?: ServiceType[];

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) tags?: string[];

  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;

  /**
   * CUSTOM audiences only. Capped because a hand-typed list beyond this is a
   * sign the office wanted a segment, and an untyped paste of ten thousand
   * addresses is exactly how a sending domain gets blocked.
   */
  @IsOptional() @IsArray() @IsEmail({}, { each: true }) @ArrayMaxSize(2000) emails?: string[];
}

// ── Templates ──────────────────────────────────────────────────────────────

export class CreateMarketingTemplateDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) subject!: string;
  @IsOptional() @IsString() @MaxLength(40) eyebrow?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsString() @IsNotEmpty() bodyMn!: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(300) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) footerNote?: string;
  @IsOptional() @IsIn(TONES) tone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateMarketingTemplateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(40) eyebrow?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsOptional() @IsString() bodyMn?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(300) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) footerNote?: string;
  @IsOptional() @IsIn(TONES) tone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Campaigns ──────────────────────────────────────────────────────────────

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  @IsOptional() @IsUUID() templateId?: string;

  @IsString() @IsNotEmpty() @MaxLength(200) subject!: string;
  @IsOptional() @IsString() @MaxLength(40) eyebrow?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsString() @IsNotEmpty() bodyMn!: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(300) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) footerNote?: string;
  @IsOptional() @IsIn(TONES) tone?: string;

  @IsEnum(MarketingAudience) audience!: MarketingAudience;

  @IsOptional() @ValidateNested() @Type(() => MarketingFiltersDto) filters?: MarketingFiltersDto;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsUUID() templateId?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(40) eyebrow?: string;
  @IsOptional() @IsString() @MaxLength(200) heading?: string;
  @IsOptional() @IsString() bodyMn?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsString() @MaxLength(300) ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(300) footerNote?: string;
  @IsOptional() @IsIn(TONES) tone?: string;
  @IsOptional() @IsEnum(MarketingAudience) audience?: MarketingAudience;
  @IsOptional() @ValidateNested() @Type(() => MarketingFiltersDto) filters?: MarketingFiltersDto;
}

export class AudiencePreviewDto {
  @IsEnum(MarketingAudience) audience!: MarketingAudience;
  @IsOptional() @ValidateNested() @Type(() => MarketingFiltersDto) filters?: MarketingFiltersDto;
}

export class SendTestDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

export class QueryCampaignsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EmailCampaignStatus })
  @IsOptional()
  @IsEnum(EmailCampaignStatus)
  status?: EmailCampaignStatus;
}

export class QueryRecipientsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CampaignRecipientStatus })
  @IsOptional()
  @IsEnum(CampaignRecipientStatus)
  status?: CampaignRecipientStatus;
}

// ── Subscribers ────────────────────────────────────────────────────────────

export class SubscribeDto {
  @IsEmail({}, { message: 'Имэйл хаяг буруу байна' }) email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(10) tags?: string[];
  /** utm_source/medium/campaign of the page the form was on. */
  @IsOptional() @IsObject() utm?: Record<string, string>;
}

export class UnsubscribeDto {
  @IsString() @IsNotEmpty() @MaxLength(500) token!: string;
}

export class UpdateSubscriberDto {
  @IsEnum(SubscriberStatus) status!: SubscriberStatus;
}

export class QuerySubscribersDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SubscriberStatus })
  @IsOptional()
  @IsEnum(SubscriberStatus)
  status?: SubscriberStatus;

  @IsOptional() @IsString() @MaxLength(120) search?: string;
}
