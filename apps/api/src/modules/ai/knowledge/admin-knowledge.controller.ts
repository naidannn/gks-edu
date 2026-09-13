import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import { Role } from '../../../prisma/client.js';
import {
  CreateKnowledgeDocumentDto,
  QueryKnowledgeDocumentsDto,
  UpdateKnowledgeDocumentDto,
} from './dto/knowledge-document.dto.js';
import { KnowledgeService } from './knowledge.service.js';

/**
 * The knowledge base as staff manage it (2A-01; the full screen is 2E-01).
 *
 * Admin-only, reads included. The collection holds internal process notes and
 * the sales playbook the assistant is steered by, so a read here is not a
 * neutral act, and the write side is a channel for putting words into the
 * assistant's mouth — the reason the boilerplate version of this controller was
 * locked down in 1N-02. Consultants get the list through 2E-01 once the screen
 * can filter INTERNAL out of their view.
 */
@ApiTags('admin-ai-knowledge')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/ai/knowledge')
export class AdminKnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  @ApiOperation({ summary: 'Knowledge documents, newest edit first' })
  list(@Query() query: QueryKnowledgeDocumentsDto) {
    return this.knowledge.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One document with its chunks' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.findOne(id);
  }

  @Post()
  @Audit({ action: 'ai.knowledge.create', entity: 'KnowledgeDocument', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Write an answer card or a playbook' })
  create(@Body() dto: CreateKnowledgeDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.create(dto, user.id);
  }

  @Patch(':id')
  @Audit({ action: 'ai.knowledge.update', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Edit a document — a changed body drops it out of the index until re-ingested' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.knowledge.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'ai.knowledge.delete', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.knowledge.remove(id);
  }
}
