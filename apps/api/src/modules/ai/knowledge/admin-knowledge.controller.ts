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
import { STAFF_ROLES } from '../../../common/constants/roles.js';
import { AccessLevel, Role } from '../../../prisma/client.js';
import { StorageService } from '../../../storage/storage.service.js';
import {
  CreateKnowledgeDocumentDto,
  QueryKnowledgeDocumentsDto,
  SearchKnowledgeDto,
  UpdateKnowledgeDocumentDto,
  UploadKnowledgeDocumentDto,
} from './dto/knowledge-document.dto.js';
import { atLeast } from '../access-level.js';
import { IngestService } from './ingest.service.js';
import { KnowledgeService } from './knowledge.service.js';
import { RetrievalService } from './retrieval.service.js';

/** 0-09's cap, restated here because multer enforces it before the service sees the bytes. */
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * The knowledge base as staff manage it (2A-01, 2E-01).
 *
 * Reading is staff-wide and *scoped*: a consultant sees the PUBLIC, REGISTERED
 * and CONTRACTED documents they work with every day, and never the INTERNAL ones
 * — those are the office's margins, agent terms and sales playbooks
 * (AI-ASSISTANT.md §9). The scope is applied in the service's `where`, so asking
 * for `accessLevel=INTERNAL` returns an empty list rather than a refusal.
 *
 * Writing is admin-only. This is the channel that puts words into the
 * assistant's mouth — the reason the boilerplate version of this controller was
 * locked down in 1N-02 — and the consultant-facing write surface is the answer
 * card screen (2E-02), which is narrower on purpose.
 */
@ApiTags('admin-ai-knowledge')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/ai/knowledge')
export class AdminKnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly ingest: IngestService,
    private readonly storage: StorageService,
    private readonly retrieval: RetrievalService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Knowledge documents, newest edit first' })
  list(@Query() query: QueryKnowledgeDocumentsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.list(query, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One document with its chunks' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.knowledge.findOne(id, user.role);
  }

  @Post()
  @Roles(Role.ADMIN)
  @Audit({ action: 'ai.knowledge.create', entity: 'KnowledgeDocument', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Write an answer card or a playbook' })
  async create(@Body() dto: CreateKnowledgeDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    const document = await this.knowledge.create(dto, user.id);
    await this.ingest.enqueue(document.id);
    return document;
  }

  @Post('upload')
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ai.knowledge.reindex', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Clear the content hash and queue a fresh ingest run' })
  async reindex(@Param('id', ParseUUIDPipe) id: string) {
    await this.knowledge.findOne(id);
    await this.ingest.reindex(id);
    return { queued: true };
  }

  @Post('search-test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the hybrid search and see what it returns, at any access level',
    description:
      'The level defaults to INTERNAL — staff testing their own corpus — and can be lowered to see exactly what a visitor would get back. Which legs of the search matched is part of the answer.',
  })
  searchTest(@Body() dto: SearchKnowledgeDto, @CurrentUser() user: AuthenticatedUser) {
    // A consultant cannot test at INTERNAL: the results would be the INTERNAL
    // text itself, which is the thing the list hides from them.
    const ceiling = user.role === Role.ADMIN ? AccessLevel.INTERNAL : AccessLevel.CONTRACTED;
    const requested = dto.accessLevel ?? ceiling;

    return this.retrieval.search({
      query: dto.query,
      level: atLeast(requested, ceiling) ? ceiling : requested,
      limit: dto.limit,
    });
  }

  @Post('reindex-pending')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'ai.knowledge.reindexPending', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Queue every published document that is not currently indexed' })
  async reindexPending() {
    return { queued: await this.ingest.enqueuePending() };
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
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
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'ai.knowledge.delete', entity: 'KnowledgeDocument' })
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.knowledge.remove(id);
  }
}
