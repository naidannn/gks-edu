import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role } from '../../prisma/client.js';
import { AiConfigService } from './ai-config.service.js';
import { UpdateAiConfigDto } from './dto/ai-config.dto.js';

/**
 * The assistant's settings (2B-02; the screen is 2E-05).
 *
 * Admin-only, and audited, because everything here changes what the assistant
 * says to clients: the persona it speaks in, the model behind it, how much it
 * may spend, and whether it answers at all.
 */
@ApiTags('admin-ai-config')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/ai/config')
export class AdminAiConfigController {
  constructor(private readonly config: AiConfigService) {}

  @Get()
  @ApiOperation({ summary: 'The assistant configuration, created with defaults on first read' })
  get() {
    return this.config.getForAdmin();
  }

  @Patch()
  @Audit({ action: 'ai.config.update', entity: 'AiAssistantConfig' })
  @ApiOperation({ summary: 'Retune the assistant — send only what changed' })
  update(@Body() dto: UpdateAiConfigDto, @CurrentUser() user: AuthenticatedUser) {
    return this.config.update(dto, user.id);
  }
}
