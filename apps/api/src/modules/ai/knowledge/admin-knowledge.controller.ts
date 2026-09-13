import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user.js';
import { Role } from '../../../prisma/client.js';
import { StorageService } from '../../../storage/storage.service.js';
import {
  CreateKnowledgeDocumentDto,
  QueryKnowledgeDocumentsDto,
  UpdateKnowledgeDocumentDto,
  UploadKnowledgeDocumentDto,
} from './dto/knowledge-document.dto.js';
import { IngestService } from './ingest.service.js';
import { KnowledgeService } from './knowledge.service.js';

/** 0-09's cap, restated here because multer enforces it before the service sees the bytes. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly ingest: IngestService,
    private readonly storage: StorageService,
  ) {}

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
  async create(@Body() dto: CreateKnowledgeDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    const document = await this.knowledge.create(dto, user.id);
    await this.ingest.enqueue(document.id);
    return document;
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @Audit({ action: 'ai.knowledge.upload', entity: 'KnowledgeDocument', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Upload a DOCX, PDF, MD or TXT source file and queue it for indexing' })
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadKnowledgeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (!file) throw new BadRequestException('Файл хавсаргана уу');

    const { path } = await this.storage.uploadKnowledgeFile({
      buffer: file.buffer,
      filename: file.originalname,
    });
    const document = await this.knowledge.createFromFile({ dto, sourceFile: path, actorId: user.id });
    await this.ingest.enqueue(document.id);
    return document;
  }

  @Post(':id/reindex')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ai.knowledge.reindex', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Clear the content hash and queue a fresh ingest run' })
  async reindex(@Param('id', ParseUUIDPipe) id: string) {
    await this.knowledge.findOne(id);
    await this.ingest.reindex(id);
    return { queued: true };
  }

  @Post('reindex-pending')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ai.knowledge.reindexPending', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Queue every published document that is not currently indexed' })
  async reindexPending() {
    return { queued: await this.ingest.enqueuePending() };
  }

  @Patch(':id')
  @Audit({ action: 'ai.knowledge.update', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Edit a document — a changed body drops it out of the index until re-ingested' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKnowledgeDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const document = await this.knowledge.update(id, dto, user.id);

    // An access level or a school moved on the document has to move on its
    // chunks too, or the retrieval filter keeps answering with the old level.
    if (dto.accessLevel !== undefined || dto.universityId !== undefined) {
      await this.knowledge.syncChunkAccess(id);
    }
    await this.ingest.enqueue(id);

    return document;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'ai.knowledge.delete', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.knowledge.remove(id);
  }
}
