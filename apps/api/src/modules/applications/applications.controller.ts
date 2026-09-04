import {
  Body,
  Controller,
  Get,
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
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ApplicationsService } from './applications.service.js';
import {
  CreateApplicationDto,
  QueryApplicationsDto,
  RecordResultDto,
  RequestAdditionalDocsDto,
  ScheduleInterviewDto,
  TransitionApplicationDto,
  UpdateApplicationDto,
} from './dto/application.dto.js';
import { CreateInvitationDto, CreateSchoolInvoiceDto, UpdateSchoolInvoiceDto } from './dto/school-invoice.dto.js';
import { SchoolInvoicesService } from './school-invoices.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 1E — application, school invoice and invitation. */
@ApiTags('applications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly invoices: SchoolInvoicesService,
  ) {}

  // ─── Applications ───────────────────────────────────────────────────────────

  @Get('applications')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'All applications, filtered by status/service/university (1E-11)' })
  findAll(@Query() query: QueryApplicationsDto) {
    return this.applications.findAll(query);
  }

  @Get('applications/report/universities')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Submissions and outcomes per university (1E-12)' })
  report() {
    return this.applications.reportByUniversity();
  }

  @Get('cases/:caseId/application')
  @ApiOperation({ summary: 'The case`s application plus its document-readiness gate (1E-03)' })
  findForCase(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.applications.findForCase(caseId, user);
  }

  @Post('cases/:caseId/application')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Open the application for a case (1E-01)' })
  create(@Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: CreateApplicationDto) {
    return this.applications.createForCase(caseId, dto);
  }

  @Patch('applications/:id')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Target school/programme, school reference number, admission fee' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApplicationDto) {
    return this.applications.update(id, dto);
  }

  @Post('applications/:id/transitions')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Move the application through its 9 states (1E-02)' })
  transition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransitionApplicationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.applications.transition(id, dto, user);
  }

  @Post('applications/:id/interview')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Schedule the interview and publish its preparation note (1E-05)' })
  scheduleInterview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleInterviewDto) {
    return this.applications.scheduleInterview(id, dto);
  }

  @Post('applications/:id/additional-documents')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'The school asked for more paperwork — add it to the checklist (1E-04)' })
  requestDocs(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestAdditionalDocsDto) {
    return this.applications.requestAdditionalDocs(id, dto);
  }

  @Post('applications/:id/results')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Record a decision — round 2 exists for GKS only (1E-02)' })
  recordResult(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordResultDto, @CurrentUser() user: AuthenticatedUser) {
    return this.applications.recordResult(id, dto, user);
  }

  // ─── School invoices (1E-06, 1E-08) ─────────────────────────────────────────

  @Get('cases/:caseId/school-invoices')
  @ApiOperation({ summary: 'The school`s bills for this case' })
  listInvoices(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.findForCase(caseId, user);
  }

  @Post('cases/:caseId/school-invoices')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Record a school invoice; the MNT figure is snapshotted at today`s rate (1E-06)' })
  createInvoice(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateSchoolInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.create(caseId, dto, user);
  }

  @Patch('school-invoices/:id')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Payment status, deadline, school confirmation (1E-08)' })
  updateInvoice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSchoolInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.update(id, dto, user);
  }

  @Post('school-invoices/:id/receipt')
  @Roles(...DOC_STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Attach the transfer receipt and mark the invoice paid (1E-08)' })
  attachReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.attachReceipt(id, file.buffer, user);
  }

  @Get('school-invoices/:id/receipt-url')
  @ApiOperation({ summary: 'Signed download token for the receipt (§9)' })
  receiptUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.receiptUrl(id, user);
  }

  // ─── Invitation (1E-09) ─────────────────────────────────────────────────────

  @Get('cases/:caseId/invitation')
  @ApiOperation({ summary: 'The invitation letter, once it has arrived' })
  invitation(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.invitationForCase(caseId, user);
  }

  @Post('cases/:caseId/invitation')
  @Roles(...DOC_STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Record the invitation — advances the case and opens the visa stage (1E-09)' })
  recordInvitation(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.invoices.recordInvitation(caseId, dto, file?.buffer, user);
  }

  @Get('cases/:caseId/invitation/url')
  @ApiOperation({ summary: 'Signed download token for the invitation file (§9)' })
  invitationUrl(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoices.invitationUrl(caseId, user);
  }
}
