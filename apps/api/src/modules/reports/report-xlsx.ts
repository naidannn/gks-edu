import ExcelJS from 'exceljs';
import { LEAD_SOURCE_LABELS, LEAD_STAGE_LABELS, SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';
import type { ClientPhase } from '../clients/client-phase.js';
import { OFFICE_TIME_ZONE, shiftIsoDay } from './report-period.js';
import type { ConsultationReportRow, PeopleReport, ReportWorkbook } from './report-types.js';

/**
 * Excel workbooks (1M-11).
 *
 * The CSV exports (`report-csv.ts`) are figures; these are people, and they
 * are read by somebody who will sort, filter and ring down the list. So they
 * are real `.xlsx` rather than CSV: dates are dates Excel can sort, the header
 * row is frozen with a filter on it, and nothing depends on the reader's
 * system code page.
 *
 * Every time is the office's wall clock. Excel has no time zones — a cell holds
 * a calendar date and a clock — so a UTC instant written as-is would show a
 * 09:00 sign-up as 01:00.
 */

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Mongolian for the business phase. The frontend map is unreachable from here. */
const CLIENT_PHASE_LABELS: Record<ClientPhase, string> = {
  ACTIVE: 'Идэвхтэй',
  PREPARING: 'Гэрээ бэлтгэж буй',
  ON_HOLD: 'Түр зогссон',
  COMPLETED: 'Үйлчилгээ дууссан',
  CANCELLED: 'Цуцлагдсан',
};

/** What each workbook is called — the mail subject and the sheet title reuse it. */
export const WORKBOOK_TITLES: Record<ReportWorkbook, string> = {
  clients: 'Үйлчлүүлэгч болсон хүмүүс',
  consultations: 'Зөвлөгөө хүссэн, авсан хүмүүс',
};

export interface XlsxFile {
  filename: string;
  content: Buffer;
}

type Cell = string | number | Date | null;

interface Column {
  header: string;
  width: number;
  /** Excel number format, for date columns. */
  numFmt?: string;
}

const DATE_TIME = 'yyyy-mm-dd hh:mm';
const DATE = 'yyyy-mm-dd';

export async function peopleWorkbook(report: PeopleReport, kind: ReportWorkbook): Promise<XlsxFile> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'GKSedu';
  workbook.created = new Date();

  if (kind === 'clients') {
    addSheet(workbook, {
      name: 'Үйлчлүүлэгч болсон',
      title: `${WORKBOOK_TITLES.clients} · ${report.period.labelMn}`,
      columns: [
        { header: '№', width: 5 },
        { header: 'Код', width: 14 },
        { header: 'Овог', width: 16 },
        { header: 'Нэр', width: 16 },
        { header: 'Утас', width: 13 },
        { header: 'И-мэйл', width: 26 },
        { header: 'Үйлчилгээ', width: 20 },
        { header: 'Сургууль', width: 28 },
        { header: 'Мэргэжил', width: 22 },
        { header: 'Суваг', width: 16 },
        { header: 'Зөвлөгөөнөөс ирсэн', width: 12 },
        { header: 'Хариуцсан зөвлөх', width: 20 },
        { header: 'Төлөв', width: 18 },
        { header: 'Бүртгэсэн', width: 17, numFmt: DATE_TIME },
        { header: 'Гэрээ байгуулсан', width: 12, numFmt: DATE },
        { header: 'Урьдчилгаа төлсөн', width: 12, numFmt: DATE },
      ],
      rows: report.clients.map((row, index) => [
        index + 1,
        row.code,
        row.lastName,
        row.firstName,
        row.phone,
        row.email,
        SERVICE_TYPE_LABELS[row.serviceType],
        row.universityNameMn,
        row.targetMajor,
        LEAD_SOURCE_LABELS[row.source],
        row.fromLead ? 'Тийм' : 'Үгүй',
        row.consultantName,
        CLIENT_PHASE_LABELS[row.phase],
        officeWallClock(row.registeredAt),
        officeWallClock(row.contractSignedAt),
        officeWallClock(row.prepaymentPaidAt),
      ]),
      empty: 'Энэ хугацаанд үйлчлүүлэгч бүртгэгдээгүй.',
    });
  } else {
    addSheet(workbook, {
      name: 'Зөвлөгөө хүссэн',
      title: `Зөвлөгөө хүссэн хүмүүс · ${report.period.labelMn}`,
      ...consultationTable(report.requested),
      empty: 'Энэ хугацаанд зөвлөгөөний хүсэлт ирээгүй.',
    });
    addSheet(workbook, {
      name: 'Зөвлөгөө авсан',
      title: `Зөвлөгөө авсан хүмүүс · ${report.period.labelMn}`,
      ...consultationTable(report.consulted),
      empty: 'Энэ хугацаанд зөвлөгөө өгсөн бүртгэл алга.',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: workbookFilename(report, kind), content: Buffer.from(buffer) };
}

/** Both consultation sheets share one shape, so one list can be compared against the other. */
function consultationTable(rows: ConsultationReportRow[]): { columns: Column[]; rows: Cell[][] } {
  return {
    columns: [
      { header: '№', width: 5 },
      { header: 'Овог', width: 16 },
      { header: 'Нэр', width: 16 },
      { header: 'Утас', width: 13 },
      { header: 'И-мэйл', width: 26 },
      { header: 'Суваг', width: 16 },
      { header: 'Сонирхсон үйлчилгээ', width: 24 },
      { header: 'Мэргэжил', width: 22 },
      { header: 'Хариуцсан ажилтан', width: 20 },
      { header: 'Үе шат', width: 20 },
      { header: 'Хүсэлт ирсэн', width: 17, numFmt: DATE_TIME },
      { header: 'Зөвлөгөө авсан', width: 17, numFmt: DATE_TIME },
      { header: 'Үйлчлүүлэгчийн код', width: 14 },
    ],
    rows: rows.map((row, index) => [
      index + 1,
      row.lastName,
      row.firstName,
      row.phone,
      row.email,
      LEAD_SOURCE_LABELS[row.source],
      row.interestedServices.map((service) => SERVICE_TYPE_LABELS[service]).join(', ') || null,
      row.interestedMajor,
      row.assignedToName,
      LEAD_STAGE_LABELS[row.stage],
      officeWallClock(row.requestedAt),
      officeWallClock(row.consultedAt),
      row.clientCode,
    ]),
  };
}

interface SheetSpec {
  name: string;
  title: string;
  columns: Column[];
  rows: Cell[][];
  /** Said in the sheet when there is nothing to list, so an empty file is not mistaken for a broken one. */
  empty: string;
}

/** Row 1 the title, row 2 the count, row 4 the header — frozen and filterable. */
const HEADER_ROW = 4;

function addSheet(workbook: ExcelJS.Workbook, spec: SheetSpec): void {
  const sheet = workbook.addWorksheet(spec.name, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW }],
  });
  sheet.columns = spec.columns.map((column) => ({
    width: column.width,
    ...(column.numFmt ? { style: { numFmt: column.numFmt } } : {}),
  }));

  sheet.getCell('A1').value = spec.title;
  sheet.getCell('A1').font = { bold: true, size: 13 };
  sheet.getCell('A2').value = spec.rows.length ? `Нийт: ${spec.rows.length}` : spec.empty;
  sheet.getCell('A2').font = { color: { argb: 'FF6B7280' } };

  const header = sheet.getRow(HEADER_ROW);
  header.values = spec.columns.map((column) => column.header);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
  });

  for (const row of spec.rows) sheet.addRow(row);

  sheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + Math.max(spec.rows.length, 1), column: spec.columns.length },
  };
}

/**
 * An instant as the office's wall clock, encoded the way Excel reads a cell:
 * a `Date` whose UTC fields *are* the Ulaanbaatar date and time.
 */
export function officeWallClock(value: string | null): Date | null {
  if (!value) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: OFFICE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  );
}

/** ASCII, like the CSV names, and the last day *inclusive* — the way a person names a range. */
export function workbookFilename(report: PeopleReport, kind: ReportWorkbook): string {
  const stem = kind === 'clients' ? 'uilchluulegch' : 'zuvluguu';
  return `${stem}-${report.period.from}-${shiftIsoDay(report.period.to, -1)}.xlsx`;
}
