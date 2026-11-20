import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { activeStaffWhere, STAFF_ROLES } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService, type EmailAttachment } from '../notifications/email.service.js';
import type { ReportWorkbook } from './report-types.js';
import { peopleWorkbook, WORKBOOK_TITLES, XLSX_CONTENT_TYPE } from './report-xlsx.js';
import { ReportsService, type ReportRequest } from './reports.service.js';

export interface ReportRecipient {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export interface ReportMailResult {
  sent: string[];
  failed: { email: string; error: string }[];
}

/**
 * 1M-11 — mail the people workbooks to colleagues, on demand.
 *
 * **Recipients are staff accounts, never typed addresses.** These files are
 * names and phone numbers; a free-text "To" field is a way to send the client
 * list to a personal Gmail, or to a typo. The caller picks from the active
 * admins and consultants — the roles that can open the report themselves — and
 * the address is the one on that account, so the file only ever lands where
 * the screen would have shown it anyway.
 *
 * Transactional rail (Resend): a person asked for this mail and is waiting for
 * it, which is the definition `CLAUDE.md` rule 8 draws. One message per
 * recipient, so nobody sees who else received it.
 */
@Injectable()
export class ReportMailService {
  private readonly logger = new Logger(ReportMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
  ) {}

  /** Who the picker offers: active admins and consultants that have an address. */
  async recipients(): Promise<ReportRecipient[]> {
    const rows = await this.prisma.user.findMany({
      where: { ...activeStaffWhere(STAFF_ROLES), email: { not: null } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({ id: row.id, name: row.name, email: row.email!, role: row.role }));
  }

  async send(
    request: ReportRequest,
    workbooks: ReportWorkbook[],
    recipientIds: string[],
    sender: AuthenticatedUser,
  ): Promise<ReportMailResult> {
    const ids = [...new Set(recipientIds)];
    const kinds = [...new Set(workbooks)];

    const [recipients, senderRow, report] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids }, ...activeStaffWhere(STAFF_ROLES), email: { not: null } },
        select: { id: true, email: true },
      }),
      this.prisma.user.findUnique({ where: { id: sender.id }, select: { name: true, email: true } }),
      this.reports.peopleReport(request),
    ]);
    if (recipients.length !== ids.length) {
      throw new BadRequestException('Хүлээн авагчийн зарим нь идэвхтэй админ эсвэл зөвлөх биш, эсвэл и-мэйлгүй байна');
    }

    const files = await Promise.all(kinds.map((kind) => peopleWorkbook(report, kind)));
    const attachments: EmailAttachment[] = files.map((file) => ({ ...file, contentType: XLSX_CONTENT_TYPE }));

    const counts = {
      clients: `Үйлчлүүлэгч болсон: ${report.clients.length}`,
      consultations: `Зөвлөгөө хүссэн: ${report.requested.length}\nЗөвлөгөө авсан: ${report.consulted.length}`,
    } satisfies Record<ReportWorkbook, string>;
    const senderName = senderRow?.name ?? senderRow?.email ?? 'Ажилтан';
    const titles = kinds.map((kind) => WORKBOOK_TITLES[kind]);

    const message = {
      subject: `Тайлан: ${titles.join(' ба ')} — ${report.period.labelMn}`,
      eyebrow: 'Тайлан',
      heading: titles.join(' ба '),
      body: [
        `${senderName} танд «${report.period.labelMn}» хугацааны тайланг Excel файлаар илгээлээ.`,
        '',
        `Хугацаа: ${report.period.labelMn}`,
        ...kinds.map((kind) => counts[kind]),
        '',
        ...files.map((file) => `- ${file.filename}`),
      ].join('\n'),
      cta: { label: 'Тайланг системээс харах', url: this.email.link('/admin/reports?tab=people') },
      footerNote: 'Хавсралтад үйлчлүүлэгчдийн хувийн мэдээлэл байгаа тул гадагш дамжуулахгүй байна уу.',
    };

    const result: ReportMailResult = { sent: [], failed: [] };
    for (const recipient of recipients) {
      const to = recipient.email!;
      try {
        await this.email.send(to, message, 'report_people', attachments);
        result.sent.push(to);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.error(`Тайлангийн и-мэйл ${to} хаяг руу явсангүй: ${detail}`);
        result.failed.push({ email: to, error: detail });
      }
    }

    // Who sent which people to whom is worth a row: these files are personal data.
    await this.audit.record({
      actorId: sender.id,
      actorLabel: sender.email,
      action: 'report.email',
      entity: 'Report',
      after: {
        workbooks: kinds,
        period: { from: report.period.from, to: report.period.to },
        sent: result.sent,
        failed: result.failed.map((item) => item.email),
      },
    });

    return result;
  }
}
