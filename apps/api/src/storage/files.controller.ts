import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { StorageService } from './storage.service.js';

/**
 * The only route that ever serves file bytes (ARCHITECTURE.md §9). It is
 * `@Public()` at the guard level because the authorization is the signature
 * itself — a token minted by `StorageService.sign()` after the caller's role
 * and ownership were already checked.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Download a file via its short-lived signed token (§9)' })
  async download(@Param('token') token: string): Promise<StreamableFile> {
    const path = this.storage.verify(token);
    const buffer = await this.storage.read(path);
    return new StreamableFile(buffer, { type: this.storage.contentTypeFor(path) });
  }
}
