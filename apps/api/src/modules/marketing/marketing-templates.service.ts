import { Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MARKETING_TEMPLATES } from './marketing-templates.data.js';

export interface TemplateInput {
  name: string;
  subject: string;
  eyebrow?: string | null;
  heading?: string | null;
  bodyMn: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
  tone?: string;
  isActive?: boolean;
}

/**
 * 1O — campaign template administration.
 *
 * Same contract as `NotificationTemplatesService`: seeding creates what is
 * missing and never touches what exists, so an admin's wording survives every
 * deploy. Templates written in the admin screen carry no `key` at all — only
 * the four shipped ones do, and the key is what makes the top-up idempotent.
 */
@Injectable()
export class MarketingTemplatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketingTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedDefaults();
    } catch (error) {
      this.logger.error(
        'Маркетингийн загварыг ачаалах үед үүсгэж чадсангүй',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  list(activeOnly = false) {
    return this.prisma.marketingTemplate.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.marketingTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Имэйлийн загвар олдсонгүй');
    return template;
  }

  create(input: TemplateInput, createdById?: string) {
    return this.prisma.marketingTemplate.create({
      data: { ...input, tone: input.tone ?? 'info', createdById: createdById ?? null },
    });
  }

  async update(id: string, patch: Partial<TemplateInput>) {
    await this.findOne(id);
    return this.prisma.marketingTemplate.update({ where: { id }, data: patch });
  }

  /**
   * Templates are deleted, not archived: a campaign copies its content at
   * creation time, so nothing already sent loses anything, and `templateId`
   * is `SetNull`.
   */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.marketingTemplate.delete({ where: { id } });
  }

  /** Idempotent — one `INSERT … ON CONFLICT DO NOTHING` on the `key` index. */
  async seedDefaults(): Promise<{ created: number; existing: number }> {
    const { count: created } = await this.prisma.marketingTemplate.createMany({
      data: MARKETING_TEMPLATES.map((template) => ({
        key: template.key,
        name: template.name,
        subject: template.subject,
        eyebrow: template.eyebrow ?? null,
        heading: template.heading ?? null,
        bodyMn: template.bodyMn,
        ctaLabel: template.ctaLabel ?? null,
        ctaUrl: template.ctaUrl ?? null,
        footerNote: template.footerNote ?? null,
        tone: template.tone ?? 'info',
      })),
      skipDuplicates: true,
    });

    return { created, existing: MARKETING_TEMPLATES.length - created };
  }
}
