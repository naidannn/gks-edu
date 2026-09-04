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
  Post as HttpPost,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role } from '../../prisma/client.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { QueryPostsDto } from './dto/query-posts.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { PostsService } from './posts.service.js';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Published blog posts (public)' })
  findPublished(@Query() query: QueryPostsDto) {
    return this.posts.findPublished(query);
  }

  @Get('admin')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'All posts incl. drafts (admin)' })
  findAllAdmin(@Query() query: QueryPostsDto) {
    return this.posts.findAllAdmin(query);
  }

  @Get('admin/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'One post by id, any status (admin)' })
  findOneAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.posts.findOneAdmin(id);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'One published post by slug (public)' })
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.posts.findPublishedBySlug(slug);
  }

  @HttpPost()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a post (admin)' })
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.create(dto, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update a post (admin)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePostDto) {
    return this.posts.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a post (admin)' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.posts.remove(id);
  }
}
