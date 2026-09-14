import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ChatChannel, FeedbackReason, FeedbackValue } from '../../../../prisma/client.js';

export class StartChatSessionDto {
  @ApiPropertyOptional({ enum: ChatChannel, default: ChatChannel.WEB_WIDGET })
  @IsEnum(ChatChannel)
  @IsOptional()
  channel?: ChatChannel;

  @ApiPropertyOptional({
    description:
      'A browser id the widget keeps, so a returning guest’s conversations can be linked — and, once they sign in, attached to their account.',
  })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  anonymousId?: string;

  @ApiPropertyOptional({ description: 'The open case, when the widget runs inside the cabinet' })
  @IsUUID()
  @IsOptional()
  caseId?: string;

  @ApiPropertyOptional({ type: Object, description: 'utm_source/medium/campaign, referrer' })
  @IsObject()
  @IsOptional()
  utm?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'The page the conversation started on' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  landingPage?: string;
}

export class SendChatMessageDto {
  @ApiProperty({ example: 'Бакалаврт орохын тулд юу бүрдүүлэх вэ?' })
  @IsString()
  @MinLength(1)
  // The same ceiling the guard enforces; rejecting here saves a round trip.
  @MaxLength(2_000)
  message!: string;
}

/**
 * 👍/👎 on one answer (2C-11).
 *
 * A thumb is one click and carries no reason; a 👎 is asked for one, because
 * "wrong" and "incomplete" send the answer to different places — the first to
 * whoever wrote the document, the second to the gap queue (§10.3).
 */
export class ChatFeedbackDto {
  @ApiProperty({ enum: FeedbackValue })
  @IsEnum(FeedbackValue)
  value!: FeedbackValue;

  @ApiPropertyOptional({ enum: FeedbackReason })
  @IsEnum(FeedbackReason)
  @IsOptional()
  reason?: FeedbackReason;

  @ApiPropertyOptional({ description: 'What was wrong, in the visitor’s own words' })
  @IsString()
  @MaxLength(1_000)
  @IsOptional()
  comment?: string;
}
