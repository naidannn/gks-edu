import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ConversationStatus, ConversationTopic } from '../../../prisma/client.js';

/** Trims and collapses the trailing newlines a textarea leaves behind. */
const trimBody = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.replace(/\s+$/u, '').replace(/^\s+/u, '') : value;

export class StartConversationDto {
  @ApiPropertyOptional({ maxLength: 160, description: 'Хоосон бол эхний мессежээс үүснэ' })
  @IsString()
  @IsOptional()
  @MaxLength(160)
  @Transform(trimBody)
  subject?: string;

  @ApiPropertyOptional({ enum: ConversationTopic })
  @IsEnum(ConversationTopic)
  @IsOptional()
  topic?: ConversationTopic;

  @ApiPropertyOptional({ description: 'Тухайн үйлчилгээний талаарх асуулт бол' })
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  @Transform(trimBody)
  body!: string;

  @ApiPropertyOptional({ maxLength: 64, description: 'Давхар илгээлтээс хамгаалах илгээгчийн түлхүүр' })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  clientToken?: string;
}

export class SendMessageDto {
  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @Length(1, 4000)
  @Transform(trimBody)
  body!: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsString()
  @IsOptional()
  @MaxLength(64)
  clientToken?: string;
}

/** Paging runs backwards from `before`, so a thread opens at its newest end. */
export class QueryMessagesDto {
  @ApiPropertyOptional({ description: 'Энэ мессежээс өмнөх хуудсыг ав' })
  @IsUUID()
  @IsOptional()
  before?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit: number = 40;
}

export class QueryMyConversationsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ enum: ConversationStatus })
  @IsEnum(ConversationStatus)
  @IsOptional()
  status?: ConversationStatus;
}

/** The inbox's four views (`InboxCounts`), expressed as one filter. */
export enum InboxScope {
  /// Everything still open, whoever holds it.
  OPEN = 'OPEN',
  /// Nobody has claimed it — the queue that must not be left standing.
  UNASSIGNED = 'UNASSIGNED',
  /// Claimed by the caller.
  MINE = 'MINE',
  /// Open, and the client spoke last: we owe an answer.
  WAITING = 'WAITING',
  RESOLVED = 'RESOLVED',
  ALL = 'ALL',
}

export class QueryInboxDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 25 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 25;

  @ApiPropertyOptional({ enum: InboxScope, default: InboxScope.OPEN })
  @IsEnum(InboxScope)
  @IsOptional()
  scope: InboxScope = InboxScope.OPEN;

  @ApiPropertyOptional({ enum: ConversationTopic })
  @IsEnum(ConversationTopic)
  @IsOptional()
  topic?: ConversationTopic;

  @ApiPropertyOptional({ description: 'Нэр, имэйл, дугаар, гарчгаар хайх' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  @Transform(trimBody)
  search?: string;
}

export class AssignConversationDto {
  @ApiPropertyOptional({ description: 'Хоосон бол хариуцагчийг салгана' })
  @IsUUID()
  @IsOptional()
  assigneeId?: string | null;
}

export class SetTypingDto {
  @ApiProperty()
  @IsBoolean()
  typing!: boolean;
}
