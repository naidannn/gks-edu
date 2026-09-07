import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { Role } from '../../prisma/client.js';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AccountClaimService } from './account-claim.service.js';
import { ClaimAccountDto, CreateStaffDto, SetStaffPasswordDto, UpdateStaffDto } from './dto/staff.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly claims: AccountClaimService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Profile of the authenticated user' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findOne(user.id);
  }

  @Get('staff')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Active staff for assignment dropdowns (1B-04, 1D-10)' })
  staff() {
    return this.users.findStaff();
  }

  // ─── Staff administration (1G-12) — before `:id` so `staff` is not a UUID ──

  @Get('staff/manage')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ажилтны бүртгэл — идэвхгүй ажилтан ба ачаалал (1G-12)' })
  listStaff() {
    return this.users.listStaff();
  }

  @Post('staff')
  @Roles(Role.ADMIN)
  @Audit({ action: 'staff.create', entity: 'User', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Ажилтан бүртгэх — нууц үггүй, урилгаар идэвхжинэ (1G-12)' })
  createStaff(@Body() dto: CreateStaffDto) {
    return this.users.createStaff(dto);
  }

  @Patch('staff/:id')
  @Roles(Role.ADMIN)
  @Audit({ action: 'staff.update', entity: 'User' })
  @ApiOperation({ summary: 'Ажилтны мэдээлэл, эрх, төлөв өөрчлөх (1G-12)' })
  updateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.users.updateStaff(id, dto, actor.id);
  }

  @Patch('staff/:id/password')
  @Roles(Role.ADMIN)
  @Audit({ action: 'staff.password.set', entity: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Ажилтны нууц үгийг шууд тохоох (1G-12)',
    description: 'Тухайн хэрэглэгчийн нээлттэй бүх сесс хаагдана.',
  })
  async setStaffPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStaffPasswordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.setStaffPassword(id, dto.password, actor.id);
  }

  @Delete('staff/:id')
  @Roles(Role.ADMIN)
  @Audit({ action: 'staff.delete', entity: 'User' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Мөр үлдээгээгүй ажилтны бүртгэлийг устгах (1G-12)' })
  async deleteStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.deleteStaff(id, actor.id);
  }

  // ─── Account claim (1B-17) ────────────────────────────────────────────────

  @Post(':id/claim-invite')
  @Roles(Role.ADMIN, Role.CONSULTANT)
  @Audit({ action: 'user.claim_invite', entity: 'User' })
  @ApiOperation({
    summary: 'Бүртгэл эзэмших урилга (дахин) илгээх (1B-17, 1B-19)',
    description: 'Хугацаа нь дууссан урилгыг сэргээх зам — шинэ токен 7 хоног хүчинтэй.',
  })
  invite(@Param('id', ParseUUIDPipe) id: string, @Body('email') email?: string) {
    return this.claims.invite(id, { email, kind: 'invite' });
  }

  @Public()
  @Post('claim')
  @ApiOperation({ summary: 'Урилгын токеноор нууц үг тохируулах (1B-17)' })
  claim(@Body() dto: ClaimAccountDto) {
    return this.claims.claim(dto.token, dto.password);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List users (admin only)' })
  findAll(@Query() query: PaginationQueryDto, @Query('search') search?: string) {
    return this.users.findAll(query.page, query.limit, search);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Fetch one user (admin only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user — own profile, or any as admin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.id !== id && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Зөвхөн өөрийн мэдээллээ засах эрхтэй');
    }
    return this.users.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.users.remove(id);
  }
}
