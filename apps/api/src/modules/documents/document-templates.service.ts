import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { DocStage, Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateDocumentTemplateDto, UpdateDocumentTemplateDto } from './dto/document-template.dto.js';
import type { CreateRequirementRuleDto, QueryRequirementRulesDto, UpdateRequirementRuleDto } from './dto/requirement-rule.dto.js';

/** 1D-17/1D-18 — admin CRUD over the two tables the rule engine reads. */
@Injectable()
export class DocumentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Templates ──────────────────────────────────────────────────────────────

  async listTemplates(includeInactive = false) {
    return this.prisma.documentTemplate.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { code: 'asc' },
      include: { _count: { select: { rules: true } } },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: { rules: { include: { university: { select: { id: true, nameMn: true } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new NotFoundException(`Материалын загвар ${id} олдсонгүй`);
    return template;
  }

  async createTemplate(dto: CreateDocumentTemplateDto) {
    const clash = await this.prisma.documentTemplate.findUnique({ where: { code: dto.code } });
    if (clash) throw new BadRequestException(`"${dto.code}" код аль хэдийн ашиглагдсан байна`);
    return this.prisma.documentTemplate.create({ data: dto });
  }

  async updateTemplate(id: string, dto: UpdateDocumentTemplateDto) {
    await this.getTemplate(id);
    if (dto.code) {
      const clash = await this.prisma.documentTemplate.findUnique({ where: { code: dto.code } });
      if (clash && clash.id !== id) throw new BadRequestException(`"${dto.code}" код аль хэдийн ашиглагдсан байна`);
    }
    return this.prisma.documentTemplate.update({ where: { id }, data: dto });
  }

  /**
   * Retire rather than delete: `CaseDocument` rows already point at the
   * template, and an issued checklist must stay readable (§9).
   */
  async deactivateTemplate(id: string) {
    await this.getTemplate(id);
    return this.prisma.$transaction(async (tx) => {
      await tx.requirementRule.updateMany({ where: { templateId: id }, data: { isActive: false } });
      return tx.documentTemplate.update({ where: { id }, data: { isActive: false } });
    });
  }

  // ─── Rules ──────────────────────────────────────────────────────────────────

  async listRules(query: QueryRequirementRulesDto) {
    const where: Prisma.RequirementRuleWhereInput = {};
    if (query.stage) where.stage = query.stage;
    if (query.templateId) where.templateId = query.templateId;
    if (query.universityId) where.universityId = query.universityId;

    return this.prisma.requirementRule.findMany({
      where,
      include: {
        template: { select: { id: true, code: true, nameMn: true, needsPhysicalOriginal: true, needsTranslation: true } },
        university: { select: { id: true, nameMn: true } },
      },
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async createRule(dto: CreateRequirementRuleDto) {
    await this.getTemplate(dto.templateId);
    return this.prisma.requirementRule.create({ data: { ...dto, universityId: dto.universityId ?? null } });
  }

  async updateRule(id: string, dto: UpdateRequirementRuleDto) {
    await this.getRule(id);
    return this.prisma.requirementRule.update({
      where: { id },
      // Written explicitly so a school-specific rule can be made universal again.
      data: { ...dto, universityId: dto.universityId === undefined ? undefined : (dto.universityId ?? null) },
    });
  }

  async removeRule(id: string) {
    await this.getRule(id);
    return this.prisma.requirementRule.update({ where: { id }, data: { isActive: false } });
  }

  /** Preview: which documents would a hypothetical client end up with (1D-17)? */
  async previewStage(stage: DocStage) {
    return this.prisma.requirementRule.findMany({
      where: { stage, isActive: true },
      include: { template: { select: { code: true, nameMn: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private async getRule(id: string) {
    const rule = await this.prisma.requirementRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`Дүрэм ${id} олдсонгүй`);
    return rule;
  }
}
