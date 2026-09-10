import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role, type ServiceType } from '../../prisma/client.js';
import { ContractsService } from './contracts.service.js';
import { CreateContractDto } from './dto/create-contract.dto.js';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto.js';
import { QueryContractsDto } from './dto/query-contracts.dto.js';
import { RegisterPhysicalContractDto } from './dto/register-physical-contract.dto.js';
import { UpsertCollateralContractDto } from './dto/upsert-collateral-contract.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get('templates')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Contract template versions, optionally by service (1C-06)' })
  listTemplates(@Query('serviceType') serviceType?: ServiceType) {
    return this.contracts.listTemplates(serviceType);
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Publish a new contract template version for a service (1C-06)' })
  createTemplate(@Body() dto: CreateContractTemplateDto) {
    return this.contracts.createTemplate(dto);
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Issue a contract for a case, snapshotting the active price/template (1C-05)' })
  create(@Body() dto: CreateContractDto) {
    return this.contracts.createForCase(dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List/search contracts (1C-18)' })
  findAll(@Query() query: QueryContractsDto) {
    return this.contracts.findAllStaff(query);
  }

  @Get('stats')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Contract counts by status for the staff workspace' })
  stats() {
    return this.contracts.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One contract (staff, or the owning user)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contracts.findOne(id, user);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Short-lived signed download link for the contract PDF' })
  downloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contracts.downloadUrl(id, user);
  }

  @Get(':id/print')
  @Roles(...STAFF_ROLES)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Print-ready contract PDF, rendered on demand and never stored (1C-25)' })
  async print(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { buffer, filename } = await this.contracts.renderPrintable(id);
    // The number is Cyrillic, so the quoted form is an ASCII fallback and
    // `filename*` carries the real name (RFC 5987).
    res.setHeader(
      'Content-Disposition',
      `inline; filename="contract-${id}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return new StreamableFile(buffer, { type: 'application/pdf' });
  }

  // Each call sends a real email, and the button is a "resend" once the first
  // one is out — so the ceiling is the resend rate a stuck client would need,
  // not the request rate a browser can produce.
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @Post(':id/accept')
  @ApiOperation({ summary: "User accepts the terms; an OTP is emailed to the account's address (1C-33)" })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.contracts.accept(id, user);
  }

  // Six digits live for five minutes; ten guesses in that window keep the
  // odds where the code length put them.
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @Post(':id/verify-otp')
  @ApiOperation({ summary: 'Verify the emailed OTP and sign the electronic contract (1C-08)' })
  verifyOtp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyOtpDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.contracts.verifyOtp(id, dto.code, user, req.ip);
  }

  @Post(':id/physical')
  @Roles(...STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Register a paper contract with its scanned copy (1C-09)' })
  registerPhysical(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegisterPhysicalContractDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    // Multer simply leaves the field undefined when nothing was attached, so
    // the scan has to be asked for here rather than dereferenced (1N-12).
    if (!file) throw new BadRequestException('Гарын үсэг зурсан гэрээний сканыг хавсаргана уу');
    return this.contracts.registerPhysical(id, dto, file.buffer);
  }

  @Put(':id/collateral')
  @Roles(...STAFF_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Record (or update) the collateral contract for a language-prep case (1C-10)' })
  upsertCollateral(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertCollateralContractDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.contracts.upsertCollateral(id, dto, file?.buffer);
  }
}
