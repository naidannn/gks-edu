import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
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
  async download(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { path, expiresAt } = this.storage.verifyWithExpiry(token);
    const buffer = await this.storage.read(path);
    // Every stored path is unique and never rewritten, so the bytes behind a
    // token cannot change. `private` keeps them out of any shared cache; the
    // lifetime ends with the token's own.
    const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    res.setHeader('Cache-Control', `private, max-age=${maxAge}, immutable`);
    return new StreamableFile(buffer, { type: this.storage.contentTypeFor(path) });
  }
}
