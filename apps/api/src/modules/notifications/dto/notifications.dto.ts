import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { NotificationChannel, NotificationEvent } from '../../../prisma/client.js';

export class QueryNotificationsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Зөвхөн уншаагүйг буцаана' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean;
}

export class SetPreferenceDto {
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(200) titleMn?: string;
  @IsOptional() @IsString() bodyMn?: string;
  @IsOptional() @IsString() @MaxLength(300) linkMn?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class QueryTemplatesDto {
  @IsOptional() @IsEnum(NotificationEvent) event?: NotificationEvent;
  @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
}
