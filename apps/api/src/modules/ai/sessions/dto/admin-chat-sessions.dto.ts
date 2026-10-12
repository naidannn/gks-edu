import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/** Which conversations a tab shows (2E-04). */
export const AI_SESSION_SCOPES = ['ALL', 'LIVE', 'USERS', 'GUESTS', 'LEADS', 'DISLIKED'] as const;
export type AiSessionScope = (typeof AI_SESSION_SCOPES)[number];

/**
 * Which surface the conversation happened on. `WEB` — the site and the cabinet
 * together — is the default: Facebook threads have an inbox of their own, and
 * the staff copilot is not a conversation with a client.
 */
export const AI_SESSION_CHANNELS = ['WEB', 'WEB_WIDGET', 'PORTAL', 'FACEBOOK', 'ALL'] as const;
export type AiSessionChannelFilter = (typeof AI_SESSION_CHANNELS)[number];

export class QueryAiSessionsDto {
  @ApiPropertyOptional({ enum: AI_SESSION_SCOPES, default: 'ALL' })
  @IsIn(AI_SESSION_SCOPES)
  @IsOptional()
  scope?: AiSessionScope;

  @ApiPropertyOptional({ enum: AI_SESSION_CHANNELS, default: 'WEB' })
  @IsIn(AI_SESSION_CHANNELS)
  @IsOptional()
  channel?: AiSessionChannelFilter;

  @ApiPropertyOptional({ description: 'Code, name, email, phone, or words from the conversation' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'One person’s conversations — from the people view' })
  @IsUUID()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'One browser’s conversations — a guest from the people view' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  anonymousId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}

export const AI_PEOPLE_KINDS = ['USERS', 'GUESTS'] as const;
export type AiPeopleKind = (typeof AI_PEOPLE_KINDS)[number];

export class QueryAiPeopleDto {
  @ApiPropertyOptional({ enum: AI_PEOPLE_KINDS, default: 'USERS' })
  @IsIn(AI_PEOPLE_KINDS)
  @IsOptional()
  kind?: AiPeopleKind;

  @ApiPropertyOptional({ enum: AI_SESSION_CHANNELS, default: 'WEB' })
  @IsIn(AI_SESSION_CHANNELS)
  @IsOptional()
  channel?: AiSessionChannelFilter;

  @ApiPropertyOptional({ description: 'Name, email or phone' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;
}
