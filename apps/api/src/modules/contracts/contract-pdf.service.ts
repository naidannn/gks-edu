import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { type ContractBlock, parseContractBody } from './contract-document.js';

const FONT_REGULAR = join(process.cwd(), 'assets/fonts/PTSans-Regular.ttf');
const FONT_BOLD = join(process.cwd(), 'assets/fonts/PTSans-Bold.ttf');
const LOGO = join(process.cwd(), 'assets/brand/gks-logo.png');

/**
 * Page geometry lifted from the office's Word contract: A4, a 3 cm binding margin on the
 * left and 1.5 cm on the right, 10 pt Arial-sized type, single-spaced clauses
 * with a 0.25" first-line indent. Word puts the logo in the running header and
 * the page number in the running footer; the numbers below are those twips
 * converted to points (1 cm = 28.3465 pt).
 */
const CM = 28.3465;
const MARGIN = { top: 75, bottom: 65, left: 3 * CM, right: 1.5 * CM };
const PAGE = { width: 595.28, height: 841.89 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
/** Word draws the letterhead 1.26" wide; the height follows the image itself. */
const LOGO_WIDTH = 90.75;
const HEADER_TOP = CM;
const FOOTER_BASELINE = PAGE.height - CM - 10;

const FONT_SIZE = 10;
const LINE_GAP = 1.5;
/** Word's `w:ind w:firstLine="360"` — a quarter inch. */
const FIRST_LINE_INDENT = 18;
const CELL_PADDING = 6;
const BORDER = 0.5;

function withoutTugrikSign(text: string): string {
  return text.replace(/₮/g, ' төгрөг');
}

/** `1.1 `, `2.6 ` — the clause number is the only bold run inside a clause. */
const CLAUSE_NUMBER = /^(\d+(?:\.\d+)*\s)(.*)$/s;
/** `ЗУУЧЛАГЧ:` — the heading of a signature column, set bold like the rest of the caps. */
const PARTY_LABEL = /^\p{Lu}[\p{Lu}\s]*:$/u;

export interface ContractPdfParams {
  title: string;
  /** The English line under the title, as the Word file carries it. */
  subtitle?: string;
  number: string;
  contractDate: Date;
  city?: string;
  bodyMn: string;
  signedAt?: Date | null;
  signedIp?: string | null;
}

/**
 * Server-side contract PDF (1C-07) — the Word file the office signs, rendered
 * with PT Sans (full Cyrillic coverage) embedded directly, no headless browser.
 */
@Injectable()
export class ContractPdfService {
  async render(params: ContractPdfParams): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margins: MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('body', FONT_REGULAR);
      doc.registerFont('bold', FONT_BOLD);

      // The letterhead sits above the text column on every page. Word leaves it
      // off page one because the office prints that sheet on headed paper; a
      // PDF has no such sheet, so it is branded throughout.
      doc.on('pageAdded', () => drawLetterhead(doc));
      drawLetterhead(doc);

      this.drawTitleBlock(doc, params);
      for (const block of parseContractBody(withoutTugrikSign(params.bodyMn))) {
        this.drawBlock(doc, block);
      }
      this.drawSignatureStamp(doc, params);
      drawPageNumbers(doc);

      doc.end();
    });
  }

  // ─── Blocks ───────────────────────────────────────────────────────────────

  /** Title, English subtitle, contract number, date and city — the Word's first four rows. */
  private drawTitleBlock(doc: PDFKit.PDFDocument, params: ContractPdfParams): void {
    doc.fillColor('#000000').font('bold').fontSize(FONT_SIZE).text(params.title, { align: 'center' });
    if (params.subtitle) {
      // The subtitle is pure Latin, so the built-in oblique face stands in for
      // the italic PT Sans we do not ship.
      doc.font('Helvetica-Oblique').fontSize(FONT_SIZE).text(params.subtitle, { align: 'center' });
    }

    doc.moveDown(1);
    doc.font('bold').fontSize(FONT_SIZE).text(`№: ${params.number}`, { align: 'left' });

    const dateLine = formatContractDateMn(params.contractDate);
    const top = doc.y;
    doc.font('body').text(dateLine, MARGIN.left, top, { width: CONTENT_WIDTH / 2, lineGap: LINE_GAP });
    doc.text(params.city ?? 'Улаанбаатар хот', MARGIN.left + CONTENT_WIDTH * 0.516, top, {
      width: CONTENT_WIDTH / 2,
      lineGap: LINE_GAP,
    });
    doc.x = MARGIN.left;
    doc.moveDown(2);
  }

  private drawBlock(doc: PDFKit.PDFDocument, block: ContractBlock): void {
    switch (block.kind) {
      case 'heading':
        doc.moveDown(1);
        doc.font('bold').fontSize(FONT_SIZE).fillColor('#000000').text(block.text, MARGIN.left, doc.y, {
          width: CONTENT_WIDTH,
          align: 'center',
          lineGap: LINE_GAP,
        });
        doc.moveDown(0.6);
        return;

      case 'paragraph':
        this.drawParagraph(doc, block.lines.join(' '));
        return;

      case 'parties':
        this.drawParties(doc, block.columns);
    }
  }

  /** A justified clause whose leading number, and only that, is bold. */
  private drawParagraph(doc: PDFKit.PDFDocument, text: string): void {
    const options = {
      width: CONTENT_WIDTH,
      align: 'justify' as const,
      indent: FIRST_LINE_INDENT,
      lineGap: LINE_GAP,
    };
    doc.fontSize(FONT_SIZE).fillColor('#000000');

    const numbered = CLAUSE_NUMBER.exec(text);
    if (numbered) {
      doc.font('bold').text(numbered[1]!, MARGIN.left, doc.y, { ...options, continued: true });
      doc.font('body').text(numbered[2]!, { ...options, indent: 0 });
    } else {
      doc.font('body').text(text, MARGIN.left, doc.y, options);
    }
  }

  /** The bordered two-column signature table that closes the contract. */
  private drawParties(doc: PDFKit.PDFDocument, columns: [string[], string[]]): void {
    const columnWidth = CONTENT_WIDTH / 2;
    const textWidth = columnWidth - CELL_PADDING * 2;

    doc.font('body').fontSize(FONT_SIZE);
    const heights = columns.map((lines) =>
      lines.reduce((sum, line) => sum + doc.heightOfString(line || ' ', { width: textWidth, lineGap: LINE_GAP }), 0),
    );
    const tableHeight = Math.max(...heights) + CELL_PADDING * 2;

    doc.moveDown(1);
    if (doc.y + tableHeight > PAGE.height - MARGIN.bottom) doc.addPage();

    const top = doc.y;
    doc.lineWidth(BORDER).strokeColor('#000000');
    doc.rect(MARGIN.left, top, CONTENT_WIDTH, tableHeight).stroke();
    doc
      .moveTo(MARGIN.left + columnWidth, top)
      .lineTo(MARGIN.left + columnWidth, top + tableHeight)
      .stroke();

    columns.forEach((lines, index) => {
      let y = top + CELL_PADDING;
      const x = MARGIN.left + index * columnWidth + CELL_PADDING;
      for (const line of lines) {
        const isLabel = PARTY_LABEL.test(line);
        doc.font(isLabel ? 'bold' : 'body').text(line || ' ', x, y, { width: textWidth, lineGap: LINE_GAP });
        y += doc.heightOfString(line || ' ', { width: textWidth, lineGap: LINE_GAP });
      }
    });

    doc.x = MARGIN.left;
    doc.y = top + tableHeight;
  }

  /** The e-signature audit line, below the paper signature block. */
  private drawSignatureStamp(doc: PDFKit.PDFDocument, params: ContractPdfParams): void {
    if (!params.signedAt) return;
    doc.moveDown(1.5);
    doc
      .font('body')
      .fontSize(8.5)
      .fillColor('#555555')
      .text(
        `Цахимаар баталгаажсан: ${params.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC${
          params.signedIp ? ` · IP: ${params.signedIp}` : ''
        }`,
        MARGIN.left,
        doc.y,
        { width: CONTENT_WIDTH },
      );
  }
}

// ─── Running header and footer ──────────────────────────────────────────────

function drawLetterhead(doc: PDFKit.PDFDocument): void {
  doc.image(LOGO, MARGIN.left, HEADER_TOP, { width: LOGO_WIDTH });
}

/** Word numbers every page but the first; `bufferPages` lets us fill them in last. */
function drawPageNumbers(doc: PDFKit.PDFDocument): void {
  const { start, count } = doc.bufferedPageRange();
  for (let i = 1; i < count; i += 1) {
    doc.switchToPage(start + i);
    // The footer sits below the text column, and pdfkit would answer that by
    // starting yet another page — so the bottom margin is lifted for the write.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('body')
      .fontSize(9)
      .fillColor('#000000')
      .text(`Хуудас ${i + 1}`, MARGIN.left, FOOTER_BASELINE, { width: CONTENT_WIDTH, align: 'center' });
    doc.page.margins.bottom = bottom;
  }
}

/** `2026 оны 09-р сарын 02-ны өдөр`, the way the Word file dates a contract. */
export function formatContractDateMn(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()} оны ${month}-р сарын ${day}-ны өдөр`;
}
