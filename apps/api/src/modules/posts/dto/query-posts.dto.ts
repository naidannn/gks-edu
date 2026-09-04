import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class QueryPostsDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by tag' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  tag?: string;
}
