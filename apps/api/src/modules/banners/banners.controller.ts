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
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { BannerPlacement, Role } from '../../prisma/client.js';
import { BannersService } from './banners.service.js';
import { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto.js';

@ApiTags('banners')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  @Public()
  // Every page on the public site asks for this in its layout, and the ones
  // rendered on the server ask from the server's own address — so this handler
  // sees the whole site's traffic under a single tracker no matter what
  // `trust proxy` says. The global 120/min turned that into 574 rejected
  // requests over 2026-09-06/07, each one a banner a visitor never saw.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({ summary: 'Одоо идэвхтэй баннерууд (нийтийн)' })
  findLive(@Query('placement') placement?: BannerPlacement) {
    return this.banners.findLive(placement);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Бүх баннер — ноорог, хугацаа дууссаныг оруулна (1G-14)' })
  findAll() {
    return this.banners.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Баннер үүсгэх' })
  create(@Body() dto: CreateBannerDto) {
    return this.banners.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Баннер засах' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.banners.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Баннер устгах' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.banners.remove(id);
  }
}
