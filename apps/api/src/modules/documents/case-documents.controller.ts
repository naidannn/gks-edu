import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { DocStage } from '../../prisma/client.js';
import { CaseDocumentsService } from './case-documents.service.js';
import { ChecklistPrintService } from './checklist-print.service.js';
import { DocumentFilesService } from './document-files.service.js';
import { DocumentRemindersService } from './document-reminders.service.js';
import { UpsertCaseConditionsDto } from './dto/case-conditions.dto.js';
import {
  AddDocumentNoteDto,
  CreateCaseDocumentDto,
  QueryCaseDocumentsDto,
  ReviewDocumentDto,
  TransitionDocumentDto,
  UpdateCaseDocumentDto,
} from './dto/case-document.dto.js';
import { CreateOfficeAppointmentDto, UpdateOfficeAppointmentDto } from './dto/office-appointment.dto.js';
import { OfficeAppointmentsService } from './office-appointments.service.js';
import { RequirementsService } from './requirements.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 10;

/** Everything hung off one case: the checklist, its conditions and its office visit. */
@ApiTags('case-documents')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('cases/:caseId')
export class CaseDocumentsController {
  constructor(
    private readonly documents: CaseDocumentsService,
    private readonly requirements: RequirementsService,
    private readonly appointments: OfficeAppointmentsService,
    private readonly checklistPrint: ChecklistPrintService,
  ) {}

  @Get('documents')
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiOperation({ summary: 'The case`s material checklist with progress (1D-13)' })
  checklist(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage: DocStage = DocStage.ADMISSION,
  ) {
    return this.documents.checklist(caseId, stage, user);
  }

  @Get('documents/progress')
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiOperation({ summary: 'How much of the required list is collected (1D-19)' })
  async progress(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage: DocStage = DocStage.ADMISSION,
  ) {
    await this.documents.assertCaseAccess(caseId, user);
    return this.documents.progress(caseId, stage);
  }

  @Post('documents/resolve')
  @Roles(...DOC_STAFF_ROLES)
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiOperation({ summary: 'Re-run the requirement engine for this case; opens the collection stage (1D-04)' })
  resolve(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage: DocStage = DocStage.ADMISSION,
  ) {
    return this.requirements.resolveForCase(caseId, stage, user.id);
  }

  @Get('documents/print')
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'The checklist as an A4 handout, rendered on demand and never stored (1D-21)' })
  async print(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
    @Query('stage') stage: DocStage = DocStage.ADMISSION,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.checklistPrint.render(caseId, stage, user);
    // The name is Cyrillic, so the quoted form is an ASCII fallback and
    // `filename*` carries the real one (RFC 5987).
    res.setHeader(
      'Content-Disposition',
      `inline; filename="checklist-${caseId}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new StreamableFile(buffer, { type: 'application/pdf' });
  }

  @Post('documents')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({
    summary: 'Add a document no rule produced — picked from the templates, or written out and saved as one (1E-04, 1D-22)',
  })
  addDocument(@Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: CreateCaseDocumentDto) {
    return this.documents.createManual(caseId, dto);
  }

  @Get('conditions')
  @ApiOperation({ summary: 'The conditions questionnaire behind the checklist (1D-06)' })
  getConditions(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.getConditions(caseId, user);
  }

  @Put('conditions')
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiOperation({ summary: 'Answer the questionnaire; the checklist is re-resolved on the spot (1D-06)' })
  upsertConditions(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpsertCaseConditionsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Query('stage') stage: DocStage = DocStage.ADMISSION,
  ) {
    return this.documents.upsertConditions(caseId, dto, user, stage);
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Office visit(s) plus the originals to bring along (1D-11)' })
  listAppointments(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.appointments.findForCase(caseId, user);
  }

  @Post('appointments')
  @ApiOperation({ summary: 'Book the single office visit for the physical originals (1D-11)' })
  createAppointment(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateOfficeAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.create(caseId, dto, user);
  }
}

/** Actions on one document, and the staff-wide review queue. */
@ApiTags('case-documents')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class DocumentActionsController {
  constructor(
    private readonly documents: CaseDocumentsService,
    private readonly files: DocumentFilesService,
    private readonly reminders: DocumentRemindersService,
    private readonly appointments: OfficeAppointmentsService,
  ) {}

  @Get('case-documents')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Review queue — oldest submission first (1D-16)' })
  queue(@Query() query: QueryCaseDocumentsDto) {
    return this.documents.reviewQueue(query);
  }

  @Get('case-documents/reminders')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Required documents whose deadline is close (1D-12)' })
  upcoming(@Query('withinDays') withinDays?: string) {
    return this.reminders.upcoming(withinDays ? Number(withinDays) : 7);
  }

  @Get('case-documents/:id')
  @ApiOperation({ summary: 'One document with its versions and review notes' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.findOne(id, user);
  }

  @Patch('case-documents/:id')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Set the deadline or necessity of one document (1D-12)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaseDocumentDto) {
    return this.documents.update(id, dto);
  }

  @Delete('case-documents/:id')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Drop a document from the checklist (soft delete, §9)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(id);
  }

  @Post('case-documents/:id/transitions')
  @ApiOperation({ summary: 'Move a document through the 12-state machine (1D-07)' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDocumentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.transition(id, dto, user);
  }

  @Post('case-documents/:id/review')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Accept / request a fix / return a submitted document (1D-09)' })
  review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.review(id, dto, user);
  }

  @Post('case-documents/:id/notes')
  @ApiOperation({ summary: 'Add a comment to a document (1D-15)' })
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddDocumentNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.addNote(id, dto, user);
  }

  @Post('case-documents/:id/files')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES_PER_UPLOAD, { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload one or more files as the next version (1D-08)' })
  upload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
    @Query('isFinal') isFinal?: string,
  ) {
    return this.files.upload(id, files, user, { isFinal: isFinal === 'true' });
  }

  @Get('document-files/:id/url')
  @ApiOperation({ summary: 'Short-lived signed download token for one version (§9)' })
  signedUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.files.signedUrl(id, user);
  }

  @Delete('document-files/:id')
  @ApiOperation({ summary: 'Withdraw an uploaded version (soft delete, §9)' })
  removeFile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.files.remove(id, user);
  }

  @Patch('office-appointments/:id')
  @ApiOperation({ summary: 'Reschedule or close out the office visit (1D-11)' })
  updateAppointment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOfficeAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointments.update(id, dto, user);
  }
}
