import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const FONT_REGULAR = join(process.cwd(), 'assets/fonts/PTSans-Regular.ttf');
const FONT_BOLD = join(process.cwd(), 'assets/fonts/PTSans-Bold.ttf');

function withoutTugrikSign(text: string): string {
  return text.replace(/₮/g, ' төгрөг');
}

export interface ContractPdfParams {
  title: string;
  bodyMn: string;
  signedAt?: Date | null;
  signedIp?: string | null;
}

/** Server-side contract PDF (1C-07) — PT Sans (full Cyrillic coverage) embedded directly, no headless browser. */
@Injectable()
export class ContractPdfService {
  async render(params: ContractPdfParams): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 56 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('body', FONT_REGULAR);
      doc.registerFont('bold', FONT_BOLD);

      doc.font('bold').fontSize(14).text('ЖИ КЭЙ ЭС ЭДҮ ГРУПП ХХК', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('bold').fontSize(12).text(params.title, { align: 'center' });
      doc.moveDown(1.2);

      // PT Sans has full Mongolian Cyrillic coverage but no ₮ (U+20AE) glyph.
      doc.font('body').fontSize(10.5).text(withoutTugrikSign(params.bodyMn), { align: 'left', lineGap: 4 });

      if (params.signedAt) {
        doc.moveDown(2);
        doc
          .font('body')
          .fontSize(9)
          .fillColor('#555555')
          .text(
            `Цахимаар баталгаажсан: ${params.signedAt.toISOString().replace('T', ' ').slice(0, 19)} UTC${
              params.signedIp ? ` · IP: ${params.signedIp}` : ''
            }`,
          );
      }

      doc.end();
    });
  }
}
