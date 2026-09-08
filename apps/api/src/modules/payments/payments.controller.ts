import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { QueryPaymentsDto } from './dto/query-payments.dto.js';
import { RegisterManualPaymentDto } from './dto/register-manual-payment.dto.js';
import { PaymentsService } from './payments.service.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('cases/:caseId/payments')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Create a QPay invoice for a case`s prepayment/balance — self-service by the owning user, or staff (1C-12)' })
  create(@Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: CreatePaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.createForCase(caseId, dto, user);
  }

  @Post('cases/:caseId/payments/manual')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Register a payment that arrived outside QPay — bank transfer, card or cash (1C-27)' })
  registerManual(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RegisterManualPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    return this.payments.registerManual(caseId, dto, user.id, receipt?.buffer);
  }

  @Get('payments')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List/search payments (1C-18)' })
  findAll(@Query() query: QueryPaymentsDto) {
    return this.payments.findAllStaff(query);
  }

  @Get('payments/stats')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Receivables summary: pending totals by kind, overdue count (1C-18)' })
  stats() {
    return this.payments.stats();
  }

  @Get('payments/:id')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'One payment (staff, or the owning user) — poll this for QPay status' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.findOne(id, user);
  }

  @Get('payments/:id/receipt-url')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Signed download token for a manually registered payment`s receipt (§9)' })
  receiptUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.receiptUrl(id, user);
  }

  @Post('payments/:id/refund')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Record a refund against a paid payment (1C-16)' })
  refund(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.payments.refund(id, user.id);
  }

  @Post('payments/qpay/webhook')
  @Public()
  @ApiOperation({ summary: 'QPay callback (1C-13) — re-verified against QPay before crediting anything' })
  webhook(@Query('paymentId', new ParseUUIDPipe({ optional: true })) paymentId?: string) {
    return this.payments.handleWebhook(paymentId);
  }

  @Post('payments/:id/dev-mark-paid')
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Dev/test only — marks a payment PAID without a real QPay account (1C-20)' })
  devMarkPaid(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.devMarkPaid(id);
  }
}
