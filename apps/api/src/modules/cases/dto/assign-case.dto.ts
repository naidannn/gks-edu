import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignCaseDto {
  @ApiPropertyOptional({ description: 'Null/omit to unassign' })
  @IsUUID()
  @IsOptional()
  assignedConsultantId?: string;

  @ApiPropertyOptional({ description: 'Null/omit to unassign' })
  @IsUUID()
  @IsOptional()
  assignedDocOfficerId?: string;
}
