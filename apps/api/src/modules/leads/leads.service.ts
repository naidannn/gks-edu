import { Injectable, Logger } from '@nestjs/common';
import { LeadActivityType, LeadSource, Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';

/** A second submission from the same number inside this window is the same person. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PublicLeadResult {
  id: string;
  /** True when the submission merged into a lead the visitor had already created. */
  merged: boolean;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consultation request from the public website (1A-15).
   *
   * Bots are answered with a plausible-looking result and nothing is written —
   * telling a spammer their submission failed only invites a retry.
   */
  async createFromPublicForm(dto: CreatePublicLeadDto): Promise<PublicLeadResult> {
    if (dto.website) {
      this.logger.warn('Honeypot triggered on the public lead form; submission dropped');
      return { id: crypto.randomUUID(), merged: false };
    }

    const phone = normalizePhone(dto.phone);
    const universityIds = await this.resolveUniversityIds(dto.interestedUniversitySlugs);

    const recent = await this.prisma.lead.findFirst({
      where: { phone, createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (recent) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: recent.id,
          type: LeadActivityType.NOTE,
          body: dto.note ?? 'Вебсайтаас давтан хүсэлт илгээсэн',
          meta: { channel: 'website_form', repeat: true } satisfies Prisma.InputJsonObject,
        },
      });
      return { id: recent.id, merged: true };
    }

    const lead = await this.prisma.lead.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email?.trim().toLowerCase(),
        age: dto.age,
        educationLevel: dto.educationLevel,
        gpa: dto.gpa,
        koreanLevel: dto.koreanLevel,
        englishLevel: dto.englishLevel,
        interestedServices: dto.interestedServices ?? [],
        interestedUniversityIds: universityIds,
        interestedMajor: dto.interestedMajor,
        note: dto.note,
        source: LeadSource.WEBSITE,
        utm: dto.utm ? (dto.utm as Prisma.InputJsonObject) : Prisma.JsonNull,
        activities: {
          create: {
            type: LeadActivityType.NOTE,
            body: dto.note ?? 'Вебсайтын зөвлөгөөний хүсэлт',
            meta: { channel: 'website_form' } satisfies Prisma.InputJsonObject,
          },
        },
      },
      select: { id: true },
    });

    // 1A-17 will hang the staff notification off this point once the queue exists.
    return { id: lead.id, merged: false };
  }

  private async resolveUniversityIds(slugs?: string[]): Promise<string[]> {
    if (!slugs?.length) return [];
    const rows = await this.prisma.university.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/** Store one canonical form so duplicate detection and search actually match. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.startsWith('976') && digits.length > 8 ? digits.slice(3) : digits;
}
