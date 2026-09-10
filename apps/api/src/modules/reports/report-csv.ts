import type {
  FinanceReport,
  IntakeRiskReport,
  OutcomesReport,
  PipelineReport,
  ReceivableBucket,
  StaffReport,
} from './report-types.js';
import { CaseStage, Role } from '../../prisma/client.js';
import { PAYMENT_KIND_LABELS, SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';

/**
 * CSV export (1M-07).
 *
 * The office's accounting does not live in this system, and it never will —
 * receivables get chased from a spreadsheet and revenue gets reconciled against
 * the bank. A report that can only be looked at is a report somebody retypes.
 *
 * Two details make the file actually open in Excel here:
 *
 * - **A UTF-8 BOM.** Without it Excel on Windows reads the file in the system
 *   code page and every Cyrillic name arrives as mojibake.
 * - **CRLF line endings**, which is what Excel's CSV parser expects.
 *
 * Labels are Mongolian because a person reads this file; the codes stay
 * alongside wherever one is needed to match a row back to the system.
 */

const BOM = '﻿';

/** Mongolian for every case stage. The frontend map is unreachable from here. */
const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  [CaseStage.CONTRACT_DRAFT]: 'Гэрээ бэлтгэж буй',
  [CaseStage.CONTRACT_SIGNED]: 'Гэрээ байгуулсан',
  [CaseStage.PREPAYMENT_PAID]: 'Урьдчилгаа төлсөн',
  [CaseStage.DOCUMENTS]: 'Материал бүрдүүлж буй',
  [CaseStage.APPLICATION_SUBMITTED]: 'Мэдүүлэг илгээсэн',
  [CaseStage.ADMITTED]: 'Элсэлт авсан',
  [CaseStage.TUITION_INVOICED]: 'Сургалтын төлбөр нэхэмжилсэн',
  [CaseStage.INVITATION_RECEIVED]: 'Урилга хүлээн авсан',
  [CaseStage.GKS_ROUND1_PASSED]: 'Тэтгэлэг 1-р шат нэвтэрсэн',
  [CaseStage.GKS_ROUND2_PASSED]: 'Тэтгэлэг 2-р шат нэвтэрсэн',
  [CaseStage.VISA]: 'Виз хүсэлт гаргасан',
  [CaseStage.VISA_APPROVED]: 'Виз гарсан',
  [CaseStage.BALANCE_PAID]: 'Үлдэгдэл төлсөн',
  [CaseStage.COLLATERAL_CONTRACT]: 'Барьцааны гэрээ',
  [CaseStage.PRE_DEPARTURE]: 'Явахын өмнөх бэлтгэл',
  [CaseStage.DEPARTED]: 'Явсан',
  [CaseStage.COMPLETED]: 'Дууссан',
  [CaseStage.ON_HOLD]: 'Түр зогссон',
  [CaseStage.CANCELLED]: 'Цуцлагдсан',
  [CaseStage.REJECTED]: 'Татгалзсан',
};

const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: 'Админ',
  [Role.CONSULTANT]: 'Зөвлөх',
  [Role.DOC_OFFICER]: 'Баримт хариуцагч',
  [Role.USER]: 'Хэрэглэгч',
};

const RECEIVABLE_BUCKET_LABELS: Record<ReceivableBucket, string> = {
  UPCOMING: 'Хугацаа болоогүй',
  OVERDUE_1_7: '1–7 хоног хэтэрсэн',
  OVERDUE_8_30: '8–30 хоног хэтэрсэн',
  OVERDUE_31_60: '31–60 хоног хэтэрсэн',
  OVERDUE_60_PLUS: '60+ хоног хэтэрсэн',
};

export type CsvCell = string | number | null | undefined;

/** RFC 4180 quoting: only where it is needed, so the file stays readable. */
function cell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return BOM + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** `2026-09-09T…` → `2026-09-09`; a spreadsheet has no use for the clock. */
function day(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export interface CsvFile {
  filename: string;
  content: string;
}

export function receivablesCsv(report: FinanceReport): CsvFile {
  return {
    filename: `avlaga-${day(report.period.generatedAt)}.csv`,
    content: toCsv(
      ['Хэргийн код', 'Үйлчлүүлэгч', 'Зөвлөх', 'Үйлчилгээ', 'Төлбөрийн төрөл', 'Дүн (₮)', 'Төлөх огноо', 'Хэтэрсэн хоног', 'Ангилал'],
      report.receivables.top.map((row) => [
        row.caseCode,
        row.clientName,
        row.consultantName,
        SERVICE_TYPE_LABELS[row.serviceType],
        PAYMENT_KIND_LABELS[row.kind],
        row.amountMnt,
        day(row.dueAt),
        row.daysOverdue,
        RECEIVABLE_BUCKET_LABELS[bucketOf(row.daysOverdue)],
      ]),
    ),
  };
}

function bucketOf(daysOverdue: number): ReceivableBucket {
  if (daysOverdue <= 0) return 'UPCOMING';
  if (daysOverdue <= 7) return 'OVERDUE_1_7';
  if (daysOverdue <= 30) return 'OVERDUE_8_30';
  if (daysOverdue <= 60) return 'OVERDUE_31_60';
  return 'OVERDUE_60_PLUS';
}

export function incomeCsv(report: FinanceReport): CsvFile {
  return {
    filename: `orlogo-${report.period.from}-${report.period.to}.csv`,
    content: toCsv(
      ['Сар', 'Урьдчилгаа (₮)', 'Үлдэгдэл (₮)', 'Бусад орлого (₮)', 'Буцаалт (₮)', 'Цэвэр орлого (₮)', 'Дамжин өнгөрсөн (₮)'],
      report.byMonth.map((row) => [
        row.month,
        row.prepaymentMnt,
        row.balanceMnt,
        row.otherMnt,
        row.refundMnt,
        row.netMnt,
        row.passThroughMnt,
      ]),
    ),
  };
}

export function outcomesCsv(report: OutcomesReport): CsvFile {
  return {
    filename: `elseltiin-ur-dun-${report.period.from}-${report.period.to}.csv`,
    content: toCsv(
      ['Сургууль', 'Солонгосоор', 'Мэдүүлсэн', 'Тэнцсэн', 'Татгалзсан', 'Хүлээгдэж буй', 'Амжилтын хувь (%)'],
      report.byUniversity.map((row) => [
        row.nameMn,
        row.nameKo,
        row.submitted,
        row.accepted,
        row.rejected,
        row.pending,
        row.successRate,
      ]),
    ),
  };
}

export function staffCsv(report: StaffReport): CsvFile {
  return {
    filename: `ajiltnii-guitsetgel-${report.period.from}-${report.period.to}.csv`,
    content: toCsv(
      [
        'Ажилтан',
        'И-мэйл',
        'Эрх',
        'Хуваарилсан сэжим',
        'Гэрээ болсон',
        'Алдсан',
        'Хөрвөлт (%)',
        'Байгуулсан гэрээ',
        'Гэрээний дүн (₮)',
        'Хураасан төлбөр (₮)',
        'Ахиулсан хэрэг',
        'Дуусгасан ажил',
        'Хянасан материал',
        'Идэвхтэй хэрэг',
        'Нээлттэй ажил',
        'Хугацаа хэтэрсэн ажил',
      ],
      report.rows.map((row) => [
        row.name,
        row.email,
        ROLE_LABELS[row.role] ?? row.role,
        row.leadsAssigned,
        row.leadsWon,
        row.leadsLost,
        row.conversionRate,
        row.contractsSigned,
        row.contractValueMnt,
        row.collectedMnt,
        row.casesAdvanced,
        row.tasksCompleted,
        row.documentsReviewed,
        row.activeCases,
        row.openTasks,
        row.overdueTasks,
      ]),
    ),
  };
}

export function intakeRiskCsv(report: IntakeRiskReport): CsvFile {
  return {
    filename: `elseltiin-ersdel-${day(report.generatedAt)}.csv`,
    content: toCsv(
      [
        'Хэргийн код',
        'Үйлчлүүлэгч',
        'Зөвлөх',
        'Баримт хариуцагч',
        'Үйлчилгээ',
        'Үе шат',
        'Сургууль',
        'Дотоод эцсийн хугацаа',
        'Үлдсэн хоног',
        'Шаардлагатай материал',
        'Бүрдсэн',
        'Хугацаа хэтэрсэн материал',
      ],
      report.cases.map((row) => [
        row.caseCode,
        row.clientName,
        row.consultantName,
        row.docOfficerName,
        SERVICE_TYPE_LABELS[row.serviceType],
        CASE_STAGE_LABELS[row.stage] ?? row.stage,
        row.universityNameMn,
        day(row.internalDeadline),
        row.daysLeft,
        row.requiredDocsTotal,
        row.requiredDocsDone,
        row.overdueDocs,
      ]),
    ),
  };
}

export function stalledCasesCsv(report: PipelineReport): CsvFile {
  return {
    filename: `gatssan-hereg-${day(report.period.generatedAt)}.csv`,
    content: toCsv(
      ['Хэргийн код', 'Үйлчлүүлэгч', 'Зөвлөх', 'Үйлчилгээ', 'Үе шат', 'Үе шатанд хоносон хоног', 'Сүүлд хөдөлсөн'],
      report.stalled.map((row) => [
        row.caseCode,
        row.clientName,
        row.consultantName,
        SERVICE_TYPE_LABELS[row.serviceType],
        CASE_STAGE_LABELS[row.stage] ?? row.stage,
        row.daysInStage,
        day(row.lastMovedAt),
      ]),
    ),
  };
}
