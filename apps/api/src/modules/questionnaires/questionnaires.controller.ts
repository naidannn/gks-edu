import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { EssayDocumentKind } from '../../prisma/client.js';
import {
  AddEssayCommentDto,
  CreateRecommendationDto,
  ReopenEssayDto,
  ResolveEssayCommentDto,
  SaveEssayDocumentDto,
  SaveEssayDto,
  SaveRecommendationAnswersDto,
  SetEssayDocumentStatusDto,
  SetRecommendationStatusDto,
  UpdateRecommendationDto,
} from './dto/questionnaire.dto.js';
import { EssayDocumentsService } from './essay-documents.service.js';
import { EssayQuestionnaireService } from './essay-questionnaire.service.js';
import { RecommendationsService } from './recommendations.service.js';

const MAX_LETTER_BYTES = 20 * 1024 * 1024;

/**
 * The GKS essay and recommendation questionnaires of one case (1D-27). Open to
 * the case's owner and to staff; the services check which and refuse a case
 * that is not GKS.
 */
@ApiTags('questionnaires')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('cases/:caseId')
export class QuestionnairesController {
  constructor(
    private readonly essay: EssayQuestionnaireService,
    private readonly documents: EssayDocumentsService,
    private readonly recommendations: RecommendationsService,
  ) {}

  @Get('essay')
  @ApiOperation({ summary: 'The essay questionnaire, its questions and answers so far' })
  getEssay(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.essay.get(caseId, user);
  }

  @Patch('essay')
  @ApiOperation({ summary: 'Autosave — merge the changed answers (and pick the level the first time)' })
  saveEssay(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: SaveEssayDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.essay.save(caseId, dto, user);
  }

  @Post('essay/submit')
  @ApiOperation({ summary: 'Hand the answers to the writer' })
  submitEssay(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.essay.submit(caseId, user);
  }

  @Post('essay/reopen')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Send the questionnaire back to the client with a note (staff)' })
  reopenEssay(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: ReopenEssayDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.essay.reopen(caseId, dto, user);
  }

  @Get('essay/text')
  @Roles(...DOC_STAFF_ROLES)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Every question and answer as plain text, for the writer (staff)' })
  essayText(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.essay.asText(caseId, user);
  }

  @Get('essay/documents')
  @ApiOperation({ summary: 'The Personal Statement and Study Plan — a client sees them once shared (1D-28)' })
  listDocuments(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(caseId, user);
  }

  @Put('essay/documents/:kind')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Autosave the writer’s editor; 409 if somebody saved in between (staff)' })
  saveDocument(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('kind', new ParseEnumPipe(EssayDocumentKind)) kind: EssayDocumentKind,
    @Body() dto: SaveEssayDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.save(caseId, kind, dto, user);
  }

  @Post('essay/documents/:kind/status')
  @ApiOperation({ summary: 'Staff share or hide the essay; the client approves it' })
  setDocumentStatus(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('kind', new ParseEnumPipe(EssayDocumentKind)) kind: EssayDocumentKind,
    @Body() dto: SetEssayDocumentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.setStatus(caseId, kind, dto, user);
  }

  @Post('essay/documents/:kind/comments')
  @ApiOperation({ summary: 'Leave a comment on the essay, optionally quoting a passage' })
  addDocumentComment(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('kind', new ParseEnumPipe(EssayDocumentKind)) kind: EssayDocumentKind,
    @Body() dto: AddEssayCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.addComment(caseId, kind, dto, user);
  }

  @Post('essay/documents/:kind/comments/:commentId/resolve')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Mark a comment dealt with, or open it again (staff)' })
  resolveDocumentComment(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('kind', new ParseEnumPipe(EssayDocumentKind)) kind: EssayDocumentKind,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: ResolveEssayCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.resolveComment(caseId, kind, commentId, dto, user);
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Recommendation letters asked for on this case' })
  listRecommendations(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.recommendations.list(caseId, user);
  }

  @Post('recommendations')
  @ApiOperation({ summary: 'Ask one more teacher — returns the link to send them' })
  createRecommendation(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.create(caseId, dto, user);
  }

  @Patch('recommendations/:id')
  @ApiOperation({ summary: 'Rename, or autosave answers the client is typing in for the teacher' })
  updateRecommendation(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecommendationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.update(caseId, id, dto, user);
  }

  @Post('recommendations/:id/submit')
  @ApiOperation({ summary: 'Hand in answers typed by the client on the teacher’s behalf' })
  submitRecommendation(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.submit(caseId, id, user);
  }

  @Delete('recommendations/:id')
  @ApiOperation({ summary: 'Withdraw a request — its link stops working' })
  removeRecommendation(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.remove(caseId, id, user);
  }

  @Post('recommendations/:id/status')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Move a letter along by hand — envelope received, or reopen (staff)' })
  setRecommendationStatus(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecommendationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.setStatus(caseId, id, dto, user);
  }

  @Post('recommendations/:id/letter')
  @Roles(...DOC_STAFF_ROLES)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LETTER_BYTES } }))
  @ApiOperation({ summary: 'Attach the English letter for the teacher to sign (staff)' })
  attachLetter(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.attachLetter(caseId, id, file, user);
  }

  @Get('recommendations/:id/letter')
  @ApiOperation({ summary: 'A 5-minute signed token for the English letter' })
  letterUrl(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.letterUrl(caseId, id, user);
  }

  @Get('recommendations/:id/text')
  @Roles(...DOC_STAFF_ROLES)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'The teacher’s answers as plain text, for the writer (staff)' })
  recommendationText(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.recommendations.asText(caseId, id, user);
  }
}

/**
 * The teacher's side: a link with a random token, no account. The token is the
 * whole authorisation, and all it opens is one questionnaire about one student.
 */
@ApiTags('questionnaires')
@Controller('recommend')
export class PublicRecommendationController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get(':token')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'The questionnaire behind a teacher’s link' })
  open(@Param('token') token: string) {
    return this.recommendations.openByToken(token);
  }

  @Patch(':token')
  @Public()
  @ApiOperation({ summary: 'Teacher autosave' })
  save(@Param('token') token: string, @Body() dto: SaveRecommendationAnswersDto) {
    return this.recommendations.saveByToken(token, dto);
  }

  @Post(':token/submit')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Teacher hands the answers in' })
  submit(@Param('token') token: string) {
    return this.recommendations.submitByToken(token);
  }
}
