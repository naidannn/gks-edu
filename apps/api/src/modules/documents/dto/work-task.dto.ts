import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';
import { WorkTaskStatus, WorkTaskType } from '../../../prisma/client.js';

export class CreateWorkTaskDto {
  @ApiProperty() @IsUUID() caseId!: string;

  @ApiPropertyOptional({ description: 'Тухайн материалын ажил бол — орчуулга гэх мэт' })
  @IsUUID()
  @IsOptional()
  caseDocumentId?: string;

  @ApiProperty({ enum: WorkTaskType })
  @IsEnum(WorkTaskType)
  type!: WorkTaskType;

  @ApiProperty() @IsString() @MaxLength(200) title!: string;
  @ApiPropertyOptional() @IsString() @MaxLength(2000) @IsOptional() description?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() assigneeId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueAt?: string;
}

export class UpdateWorkTaskDto extends PartialType(CreateWorkTaskDto) {
  @ApiPropertyOptional({ enum: WorkTaskStatus })
  @IsEnum(WorkTaskStatus)
  @IsOptional()
  status?: WorkTaskStatus;
}

export class QueryWorkTasksDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WorkTaskStatus })
  @IsEnum(WorkTaskStatus)
  @IsOptional()
  status?: WorkTaskStatus;

  @ApiPropertyOptional({ enum: WorkTaskType })
  @IsEnum(WorkTaskType)
  @IsOptional()
  type?: WorkTaskType;

  @ApiPropertyOptional() @IsUUID() @IsOptional() assigneeId?: string;
  @ApiPropertyOptional() @IsUUID() @IsOptional() caseId?: string;
}
