import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { DocStage, Role } from '../../prisma/client.js';
import { DocumentTemplatesService } from './document-templates.service.js';
import { CreateDocumentTemplateDto, UpdateDocumentTemplateDto } from './dto/document-template.dto.js';
import { CreateRequirementRuleDto, QueryRequirementRulesDto, UpdateRequirementRuleDto } from './dto/requirement-rule.dto.js';

/** 1D-17/1D-18 — the admin screens' backend. Reading is open to every document
 * officer; changing the rule base is an admin decision. */
@ApiTags('document-templates')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get('document-templates')
  @Roles(...DOC_STAFF_ROLES)
  @ApiQuery({ name: 'includeInactive', required: false })
  @ApiOperation({ summary: 'All document templates (1D-17)' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.templates.listTemplates(includeInactive === 'true');
  }

  @Get('document-templates/:id')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'One template with the rules that reference it' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.getTemplate(id);
  }

  @Post('document-templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a document template (1D-17)' })
  create(@Body() dto: CreateDocumentTemplateDto) {
    return this.templates.createTemplate(dto);
  }

  @Patch('document-templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edit a document template' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentTemplateDto) {
    return this.templates.updateTemplate(id, dto);
  }

  @Delete('document-templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retire a template and its rules — issued checklists stay readable (§9)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.deactivateTemplate(id);
  }

  @Get('requirement-rules')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Requirement rules, optionally for one stage/template/university (1D-17)' })
  listRules(@Query() query: QueryRequirementRulesDto) {
    return this.templates.listRules(query);
  }

  @Get('requirement-rules/preview')
  @Roles(...DOC_STAFF_ROLES)
  @ApiQuery({ name: 'stage', enum: DocStage, required: false })
  @ApiOperation({ summary: 'Which documents a stage`s rules can produce' })
  preview(@Query('stage') stage: DocStage = DocStage.ADMISSION) {
    return this.templates.previewStage(stage);
  }

  @Post('requirement-rules')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a requirement rule (1D-17, 1D-18)' })
  createRule(@Body() dto: CreateRequirementRuleDto) {
    return this.templates.createRule(dto);
  }

  @Patch('requirement-rules/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edit a requirement rule' })
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRequirementRuleDto) {
    return this.templates.updateRule(id, dto);
  }

  @Delete('requirement-rules/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Retire a requirement rule' })
  removeRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.templates.removeRule(id);
  }
}
