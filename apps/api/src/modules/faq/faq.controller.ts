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
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import { CreateFaqDto } from './dto/create-faq.dto.js';
import { QueryFaqDto } from './dto/query-faq.dto.js';
import { UpdateFaqDto } from './dto/update-faq.dto.js';
import { FaqService } from './faq.service.js';

@ApiTags('faq')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('faqs')
export class FaqController {
  constructor(private readonly faq: FaqService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Published FAQ entries, optionally by category (public)' })
  findPublished(@Query() query: QueryFaqDto) {
    return this.faq.findPublished(query);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'All FAQ entries incl. unpublished (admin)' })
  findAllAdmin() {
    return this.faq.findAllAdmin();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a FAQ entry (admin)' })
  create(@Body() dto: CreateFaqDto) {
    return this.faq.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a FAQ entry (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFaqDto) {
    return this.faq.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a FAQ entry (admin)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.faq.remove(id);
  }
}
