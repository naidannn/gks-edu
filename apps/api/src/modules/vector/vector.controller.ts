import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { SearchDto } from './dto/search.dto.js';
import { VectorService } from './vector.service.js';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
export class VectorController {
  constructor(private readonly vector: VectorService) {}

  @Post()
  @ApiOperation({ summary: 'Store a document and embed its chunks into pgvector' })
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.vector.createDocument(dto, user.id);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cosine-similarity search across stored chunks' })
  search(@Body() dto: SearchDto) {
    return this.vector.search(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List documents' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.vector.listDocuments(query.page, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch one document with its chunks' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vector.findDocument(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.vector.removeDocument(id);
  }
}
