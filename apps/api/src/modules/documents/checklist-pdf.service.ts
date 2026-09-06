import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentStatus, Necessity, type DocStage } from '../../prisma/client.js';
import { SETTLED_STATUSES } from './document-status.js';
import { DOCUMENT_STATUS_LABELS, DOC_STAGE_LABELS } from './document-labels.js';

const FONT_REGULAR = join(process.cwd(), 'assets/fonts/PTSans-Regular.ttf');
const FONT_BOLD = join(process.cwd(), 'assets/fonts/PTSans-Bold.ttf');
const LOGO = join(process.cwd(), 'assets/brand/gks-logo.png');

/**
 * The office hands this sheet across the desk, so it is laid out as stationery
 * rather than as a table dump: letterhead, one summary panel, and rows a person
 * can tick off with a pen. The palette is the design system's
 * (`apps/web/app/assets/css/tokens.css`), copied as literal hex the way
 * `email-brand.ts` copies it — the API cannot read the web app's CSS.
 */
const COLORS = {
  ink: '#141a21',
  body: '#28313a',
  muted: '#5a6673',
  subtle: '#75818f',
  brand: '#2563eb',
  brandInk: '#1d4ed8',
  brandTint: '#f6faff',
  red: '#c3262d',
  green: '#1b8149',
  amber: '#b37400',
  line: '#dce1e7',
  lineSoft: '#eaedf1',
  box: '#9ba6b2',
} as const;

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 46, bottom: 56, left: 48, right: 48 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const BOTTOM = PAGE.height - MARGIN.bottom;

const LOGO_WIDTH = 88;
/** The letterhead band the title block starts under, on page one. */
const HEADER_HEIGHT = 58;
/** What pages after the first carry instead of the letterhead. */
const CONTINUATION_HEIGHT = 24;

/** Row geometry: a tick box, the document, and the state it is in. */
const BOX_SIZE = 12;
const BOX_GAP = 10;
const MAIN_WIDTH = 330;
const NAME_WIDTH = MAIN_WIDTH - BOX_SIZE - BOX_GAP;
const SIDE_X = MARGIN.left + MAIN_WIDTH + 16;
const SIDE_WIDTH = CONTENT_WIDTH - MAIN_WIDTH - 16;
const ROW_PAD = 8;

export interface ChecklistPdfDocument {
  nameMn: string;
  descriptionMn: string | null;
  sourceHint: string | null;
  issuerHint: string | null;
  needsTranslation: boolean;
  needsNotary: boolean;
  needsApostille: boolean;
  needsPhysicalOriginal: boolean;
  necessity: Necessity;
  status: DocumentStatus;
  conditionNote: string | null;
  dueAt: Date | null;
}

export interface ChecklistPdfParams {
  stage: DocStage;
  caseCode: string;
  clientName: string;
  clientCode: string | null;
  clientPhone: string | null;
  serviceName: string;
  universityName: string | null;
  programName: string | null;
  intakeLabel: string | null;
  /**
   * Ours, never the school's — the internal date is the only deadline that may
   * appear on a sheet a client walks out with (CLAUDE.md).
   */
  deadlineLabel: string | null;
  officerName: string | null;
  officerPhone: string | null;
  printedAt: Date;
  documents: ChecklistPdfDocument[];
}

/** The office block, repeated on every sheet's foot. */
const COMPANY = {
  legalName: '«Жи Кэй Эс Эдү Групп» ХХК',
  phone: '7710-9000',
  site: 'gksedu.mn',
  address: 'УБ, СБД 1-р хороо, Эко тауэр 1707 тоот',
} as const;

/**
 * 1D-21 — the material checklist as an A4 handout, rendered on demand and
 * never stored, the way the printable contract is (1C-25).
 */
@Injectable()
export class ChecklistPdfService {
  render(params: ChecklistPdfParams): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: MARGIN,
        bufferPages: true,
        info: { Title: `Бүрдүүлэх бичиг баримт — ${params.caseCode}` },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('body', FONT_REGULAR);
      doc.registerFont('bold', FONT_BOLD);

      let y = this.drawLetterhead(doc);
      y = this.drawTitle(doc, params, y);
      y = this.drawSummary(doc, params, y);
      y = this.drawProgress(doc, params.documents, y);

      const groups = groupDocuments(params.documents);
      let number = 0;
      for (const group of groups) {
        y = this.drawGroup(doc, params, group, y, number);
        number += group.documents.length;
      }
      if (!groups.length) {
        doc.font('body').fontSize(9.5).fillColor(COLORS.muted)
          .text('Энэ шатанд бүрдүүлэх материал бүртгэгдээгүй байна.', MARGIN.left, y, { width: CONTENT_WIDTH });
        y += 20;
      }

      this.drawNotes(doc, params, y);
      this.drawRunningMarks(doc, params);

      doc.end();
    });
  }

  // ─── Header ───────────────────────────────────────────────────────────────

  /** Logo left, office block right, and the brand's red-into-hairline rule under both. */
  private drawLetterhead(doc: PDFKit.PDFDocument): number {
    doc.image(LOGO, MARGIN.left, MARGIN.top - 6, { width: LOGO_WIDTH });

    const right = MARGIN.left + CONTENT_WIDTH - 240;
    doc.font('bold').fontSize(8.5).fillColor(COLORS.ink)
      .text(COMPANY.legalName, right, MARGIN.top - 4, { width: 240, align: 'right' });
    doc.font('body').fontSize(8).fillColor(COLORS.muted)
      .text(`${COMPANY.phone} · ${COMPANY.site}`, right, doc.y, { width: 240, align: 'right' })
      .text(COMPANY.address, right, doc.y, { width: 240, align: 'right' });

    const ruleY = MARGIN.top + HEADER_HEIGHT - 14;
    doc.lineWidth(2).strokeColor(COLORS.red)
      .moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + 46, ruleY).stroke();
    doc.lineWidth(0.75).strokeColor(COLORS.line)
      .moveTo(MARGIN.left + 46, ruleY).lineTo(MARGIN.left + CONTENT_WIDTH, ruleY).stroke();

    return ruleY + 24;
  }

  private drawTitle(doc: PDFKit.PDFDocument, params: ChecklistPdfParams, top: number): number {
    doc.font('bold').fontSize(7.5).fillColor(COLORS.brand)
      .text(DOC_STAGE_LABELS[params.stage].toUpperCase(), MARGIN.left, top, {
        width: CONTENT_WIDTH,
        characterSpacing: 1.2,
      });

    doc.font('bold').fontSize(17).fillColor(COLORS.ink)
      .text('Бүрдүүлэх бичиг баримтын жагсаалт', MARGIN.left, doc.y + 4, { width: CONTENT_WIDTH });

    return doc.y + 12;
  }

  /** Who the sheet belongs to and what it is for — one tinted panel, two columns. */
  private drawSummary(doc: PDFKit.PDFDocument, params: ChecklistPdfParams, top: number): number {
    const cells = summaryCells(params);
    const columnWidth = (CONTENT_WIDTH - 24) / 2;
    const rows = Math.ceil(cells.length / 2);
    const rowHeight = 30;
    const height = rows * rowHeight + 14;

    doc.roundedRect(MARGIN.left, top, CONTENT_WIDTH, height, 4)
      .fillAndStroke(COLORS.brandTint, COLORS.line);

    cells.forEach((cell, index) => {
      const x = MARGIN.left + 14 + (index % 2) * (columnWidth + 12);
      const y = top + 11 + Math.floor(index / 2) * rowHeight;
      doc.font('body').fontSize(6.8).fillColor(COLORS.subtle)
        .text(cell.label.toUpperCase(), x, y, { width: columnWidth - 14, characterSpacing: 0.7, lineBreak: false });
      doc.font(cell.strong ? 'bold' : 'body').fontSize(9.5).fillColor(cell.strong ? COLORS.brandInk : COLORS.body)
        .text(cell.value, x, y + 10, { width: columnWidth - 14, height: 12, ellipsis: true, lineBreak: false });
    });

    return top + height + 18;
  }

  /** How much of the required set is in — the one number staff are asked for. */
  private drawProgress(doc: PDFKit.PDFDocument, documents: ChecklistPdfDocument[], top: number): number {
    const required = documents.filter((row) => row.necessity === Necessity.REQUIRED);
    const collected = required.filter((row) => isCollected(row.status)).length;
    const ratio = required.length ? collected / required.length : 0;

    doc.font('bold').fontSize(9).fillColor(COLORS.ink)
      .text(`Бүрдсэн: ${collected} / ${required.length}`, MARGIN.left, top, { width: 160, lineBreak: false });
    doc.font('body').fontSize(8).fillColor(COLORS.muted)
      .text('Бидэнд ирсэн материалын нүд тэмдэглэгдсэн байна.', MARGIN.left + 160, top + 1, {
        width: CONTENT_WIDTH - 160,
        align: 'right',
        lineBreak: false,
      });

    const barY = top + 15;
    doc.roundedRect(MARGIN.left, barY, CONTENT_WIDTH, 5, 2.5).fill(COLORS.lineSoft);
    if (ratio > 0) {
      doc.roundedRect(MARGIN.left, barY, Math.max(CONTENT_WIDTH * ratio, 5), 5, 2.5).fill(COLORS.brand);
    }

    return barY + 22;
  }

  // ─── The list ─────────────────────────────────────────────────────────────

  private drawGroup(
    doc: PDFKit.PDFDocument,
    params: ChecklistPdfParams,
    group: ChecklistGroup,
    top: number,
    numberedFrom: number,
  ): number {
    // A heading is never left alone at the foot of a page: it travels with the
    // first row under it.
    let y = this.ensureSpace(doc, params, top, 64);
    y = this.drawGroupHeading(doc, group, y);

    group.documents.forEach((row, index) => {
      const height = this.measureRow(doc, row);
      const before = y;
      y = this.ensureSpace(doc, params, y, height);
      // A group carried onto the next page says so, rather than starting a
      // column of rows with no heading over them.
      if (y !== before) y = this.drawGroupHeading(doc, group, y, true);
      this.drawRow(doc, row, numberedFrom + index + 1, y, height);
      y += height;
    });

    return y + 14;
  }

  private drawGroupHeading(doc: PDFKit.PDFDocument, group: ChecklistGroup, top: number, continued = false): number {
    doc.font('bold').fontSize(10).fillColor(COLORS.ink)
      .text(continued ? `${group.title} (үргэлжлэл)` : group.title, MARGIN.left, top, {
        width: CONTENT_WIDTH - 60,
        lineBreak: false,
      });
    doc.font('body').fontSize(8.5).fillColor(COLORS.muted)
      .text(`${group.documents.length} материал`, MARGIN.left, top + 1, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });

    const ruleY = top + 15;
    doc.lineWidth(1).strokeColor(COLORS.ink)
      .moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + CONTENT_WIDTH, ruleY).stroke();

    if (group.note) {
      doc.font('body').fontSize(8).fillColor(COLORS.muted)
        .text(group.note, MARGIN.left, ruleY + 5, { width: CONTENT_WIDTH });
      return doc.y + 6;
    }
    return ruleY + 8;
  }

  /** One line per fact: the name, where it comes from, and what it needs doing to it. */
  private measureRow(doc: PDFKit.PDFDocument, row: ChecklistPdfDocument): number {
    doc.font('bold').fontSize(10);
    let height = doc.heightOfString(row.nameMn, { width: NAME_WIDTH });

    const hints = hintLines(row);
    if (hints.length) {
      doc.font('body').fontSize(8);
      height += 2 + hints.reduce((sum, line) => sum + doc.heightOfString(line, { width: NAME_WIDTH }), 0);
    }
    if (requirementChips(row).length) height += 16;

    doc.font('body').fontSize(8);
    const side = sideLines(row);
    const sideHeight = side.reduce(
      (sum, line) => sum + doc.heightOfString(line.text, { width: SIDE_WIDTH, align: 'right' }),
      0,
    );

    return Math.max(height, sideHeight, 22) + ROW_PAD * 2;
  }

  private drawRow(doc: PDFKit.PDFDocument, row: ChecklistPdfDocument, index: number, top: number, height: number): void {
    const collected = isCollected(row.status);
    let y = top + ROW_PAD;

    this.drawTickBox(doc, MARGIN.left, y + 1, collected);

    const x = MARGIN.left + BOX_SIZE + BOX_GAP;
    doc.font('bold').fontSize(10).fillColor(collected ? COLORS.muted : COLORS.ink)
      .text(`${index}. ${row.nameMn}`, x, y, { width: NAME_WIDTH });
    y = doc.y;

    const hints = hintLines(row);
    if (hints.length) {
      doc.font('body').fontSize(8).fillColor(COLORS.subtle);
      for (const line of hints) {
        doc.text(line, x, y + 2, { width: NAME_WIDTH });
        y = doc.y;
      }
    }

    const chips = requirementChips(row);
    if (chips.length) this.drawChips(doc, chips, x, y + 5);

    // The right column reads top-down: state, then the date it is wanted by,
    // then whatever condition put it on the list.
    let sideY = top + ROW_PAD;
    for (const line of sideLines(row)) {
      doc.font(line.strong ? 'bold' : 'body').fontSize(line.size).fillColor(line.color)
        .text(line.text, SIDE_X, sideY, { width: SIDE_WIDTH, align: 'right' });
      sideY = doc.y;
    }

    doc.lineWidth(0.5).strokeColor(COLORS.lineSoft)
      .moveTo(MARGIN.left, top + height).lineTo(MARGIN.left + CONTENT_WIDTH, top + height).stroke();
  }

  /** An empty square to tick, or a filled one with the tick already drawn. */
  private drawTickBox(doc: PDFKit.PDFDocument, x: number, y: number, checked: boolean): void {
    doc.roundedRect(x, y, BOX_SIZE, BOX_SIZE, 2.5).lineWidth(0.9);
    if (!checked) {
      doc.strokeColor(COLORS.box).stroke();
      return;
    }
    doc.fillAndStroke(COLORS.brand, COLORS.brand);
    doc.lineWidth(1.4).strokeColor('#ffffff')
      .moveTo(x + 2.8, y + 6.2).lineTo(x + 5, y + 8.6).lineTo(x + 9.2, y + 3.6).stroke();
  }

  /** Outlined pills: what has to happen to the paper before it counts. */
  private drawChips(doc: PDFKit.PDFDocument, chips: Chip[], x: number, y: number): void {
    let cursor = x;
    doc.fontSize(6.8).font('bold');
    for (const chip of chips) {
      const width = doc.widthOfString(chip.text) + 12;
      if (cursor + width > x + NAME_WIDTH) break;
      doc.roundedRect(cursor, y, width, 12, 6).lineWidth(0.6).strokeColor(chip.color).stroke();
      doc.fillColor(chip.color).text(chip.text, cursor, y + 3, { width, align: 'center', lineBreak: false });
      cursor += width + 5;
    }
  }

  /** Ruled space for what gets agreed at the desk and never fits a form field. */
  private drawNotes(doc: PDFKit.PDFDocument, params: ChecklistPdfParams, top: number): void {
    const height = 66;
    const y = this.ensureSpace(doc, params, top + 4, height);

    doc.font('bold').fontSize(8.5).fillColor(COLORS.muted)
      .text('ТЭМДЭГЛЭЛ', MARGIN.left, y, { width: CONTENT_WIDTH, characterSpacing: 0.8, lineBreak: false });

    doc.lineWidth(0.5).strokeColor(COLORS.line);
    for (let line = 0; line < 3; line += 1) {
      const lineY = y + 30 + line * 18;
      doc.moveTo(MARGIN.left, lineY).lineTo(MARGIN.left + CONTENT_WIDTH, lineY).stroke();
    }
  }

  // ─── Pagination ───────────────────────────────────────────────────────────

  /** Starts a fresh sheet when `height` will not fit on this one. */
  private ensureSpace(doc: PDFKit.PDFDocument, params: ChecklistPdfParams, y: number, height: number): number {
    if (y + height <= BOTTOM) return y;
    doc.addPage();
    return this.drawContinuationHeader(doc, params);
  }

  private drawContinuationHeader(doc: PDFKit.PDFDocument, params: ChecklistPdfParams): number {
    doc.font('body').fontSize(8).fillColor(COLORS.muted)
      .text(
        `Бүрдүүлэх бичиг баримтын жагсаалт · ${params.clientName} · ${params.caseCode}`,
        MARGIN.left,
        MARGIN.top,
        { width: CONTENT_WIDTH, lineBreak: false },
      );
    const ruleY = MARGIN.top + CONTINUATION_HEIGHT - 10;
    doc.lineWidth(0.75).strokeColor(COLORS.line)
      .moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + CONTENT_WIDTH, ruleY).stroke();
    return ruleY + 14;
  }

  /**
   * The office block and `Хуудас 2 / 3` on every sheet. Run last, over the
   * buffered pages, because the total is only known once the list is drawn.
   */
  private drawRunningMarks(doc: PDFKit.PDFDocument, params: ChecklistPdfParams): void {
    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i += 1) {
      doc.switchToPage(start + i);
      // The footer sits below the text column, which pdfkit would answer by
      // starting yet another page — so the bottom margin is lifted for the write.
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      const ruleY = BOTTOM + 16;
      doc.lineWidth(0.5).strokeColor(COLORS.lineSoft)
        .moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + CONTENT_WIDTH, ruleY).stroke();

      doc.font('body').fontSize(7.5).fillColor(COLORS.subtle)
        .text(
          `${COMPANY.legalName} · ${COMPANY.phone} · ${COMPANY.site}`,
          MARGIN.left,
          ruleY + 6,
          { width: CONTENT_WIDTH - 120, lineBreak: false },
        );
      doc.text(`Хуудас ${i + 1} / ${count}`, MARGIN.left, ruleY + 6, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });
      // Printed on the last sheet only: it dates the sheet someone files.
      if (i === count - 1) {
        doc.text(`Хэвлэсэн: ${formatDateMn(params.printedAt)}`, MARGIN.left, ruleY + 16, {
          width: CONTENT_WIDTH,
          align: 'right',
          lineBreak: false,
        });
      }

      doc.page.margins.bottom = bottom;
    }
  }
}

// ─── Pure layout helpers (unit-tested) ──────────────────────────────────────

export interface Chip {
  text: string;
  color: string;
}

export interface ChecklistGroup {
  title: string;
  note: string | null;
  documents: ChecklistPdfDocument[];
}

/** A document already in our hands — the tick box is drawn filled. */
export function isCollected(status: DocumentStatus): boolean {
  return SETTLED_STATUSES.includes(status);
}

/**
 * Two sections, because the sheet answers two different questions: what has to
 * be brought, and what only some people have to bring. Optional and conditional
 * rows share the second one — the difference between them is a staff nuance,
 * and on paper both mean "only if it applies to you".
 */
export function groupDocuments(documents: ChecklistPdfDocument[]): ChecklistGroup[] {
  const required = documents.filter((row) => row.necessity === Necessity.REQUIRED);
  const rest = documents.filter((row) => row.necessity !== Necessity.REQUIRED);

  const groups: ChecklistGroup[] = [];
  if (required.length) groups.push({ title: 'Заавал бүрдүүлэх', note: null, documents: required });
  if (rest.length) {
    groups.push({
      title: 'Нөхцөлт ба нэмэлт материал',
      note: 'Доорх материалыг зөвхөн тухайн нөхцөл тохирох тохиолдолд бүрдүүлнэ.',
      documents: rest,
    });
  }
  return groups;
}

/** Where the paper comes from and how long it stays good for. */
export function hintLines(row: ChecklistPdfDocument): string[] {
  const lines: string[] = [];
  if (row.descriptionMn) lines.push(row.descriptionMn);

  const source = [row.sourceHint, row.issuerHint].filter(Boolean).join(' · ');
  if (source) lines.push(source);
  return lines;
}

/** What has to be done to the paper before it counts as collected. */
export function requirementChips(row: ChecklistPdfDocument): Chip[] {
  const chips: Chip[] = [];
  if (row.needsPhysicalOriginal) chips.push({ text: 'ЭХ ХУВИАР', color: COLORS.red });
  if (row.needsTranslation) chips.push({ text: 'ОРЧУУЛГА', color: COLORS.amber });
  if (row.needsNotary) chips.push({ text: 'НОТАРИАТ', color: COLORS.brandInk });
  if (row.needsApostille) chips.push({ text: 'АПОСТИЛЬ', color: COLORS.green });
  return chips;
}

interface SideLine {
  text: string;
  size: number;
  color: string;
  strong: boolean;
}

function sideLines(row: ChecklistPdfDocument): SideLine[] {
  const lines: SideLine[] = [
    {
      text: DOCUMENT_STATUS_LABELS[row.status],
      size: 8.5,
      color: statusColor(row.status),
      strong: true,
    },
  ];
  if (row.dueAt) {
    lines.push({ text: `Хугацаа: ${formatDateMn(row.dueAt)}`, size: 8, color: COLORS.muted, strong: false });
  }
  if (row.conditionNote) {
    lines.push({ text: row.conditionNote, size: 7.5, color: COLORS.subtle, strong: false });
  }
  return lines;
}

function statusColor(status: DocumentStatus): string {
  if (isCollected(status)) return COLORS.green;
  if (status === DocumentStatus.NEEDS_FIX || status === DocumentStatus.RESUBMIT_REQUIRED) return COLORS.red;
  if (status === DocumentStatus.SUBMITTED || status === DocumentStatus.UNDER_REVIEW) return COLORS.brandInk;
  return COLORS.muted;
}

interface SummaryCell {
  label: string;
  value: string;
  strong?: boolean;
}

/** The panel under the title — six facts, in the order someone reads them out. */
export function summaryCells(params: ChecklistPdfParams): SummaryCell[] {
  const school = [params.universityName, params.programName].filter(Boolean).join(' · ');
  return [
    {
      label: 'Үйлчлүүлэгч',
      value: params.clientCode ? `${params.clientName} (${params.clientCode})` : params.clientName,
    },
    { label: 'Хэрэг', value: params.caseCode },
    { label: 'Үйлчилгээ', value: params.serviceName },
    { label: 'Элсэлт', value: params.intakeLabel ?? '—' },
    { label: 'Сургууль', value: school || '—' },
    // Ours, and the only one a client is ever shown (CLAUDE.md).
    { label: 'Материал өгөх эцсийн хугацаа', value: params.deadlineLabel ?? '—', strong: true },
    {
      label: 'Хариуцсан ажилтан',
      value: [params.officerName, params.officerPhone].filter(Boolean).join(' · ') || '—',
    },
    { label: 'Утас', value: params.clientPhone ?? '—' },
  ];
}

/** `2026 оны 09 сарын 14`, the way a Mongolian office writes a date on paper. */
export function formatDateMn(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()} оны ${month} сарын ${day}`;
}

/** Intake deadlines are stored end-of-day UTC; local getters read them a day late. */
export function formatDeadlineMn(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()} оны ${month} сарын ${day}`;
}

/** `Бүрдүүлэх материал-GKS-2026-0417-элсэлт.pdf` — Cyrillic, so the header escapes it. */
export function checklistFilename(caseCode: string, stage: DocStage): string {
  return `Бүрдүүлэх материал-${caseCode}-${DOC_STAGE_LABELS[stage]}.pdf`;
}
