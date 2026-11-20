import { BadRequestException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

/**
 * 1D-32 — the office keeps every material as a PDF, and most clients send a
 * phone photo. Asking them for a scanner app first is how a document never
 * gets uploaded, so the photos of one upload become one PDF here instead: a
 * passport shot as two pictures is one paper, two pages.
 *
 * Each photo is re-encoded before it goes in. `rotate()` applies the EXIF
 * orientation (a portrait shot would otherwise land on its side, since a PDF
 * ignores EXIF), re-encoding drops the GPS position a phone writes into it,
 * and a 12-megapixel original is cut down to what reads and prints at A4.
 */

/** The image formats a photo of a paper arrives in; HEIC is absent — the prebuilt libvips cannot decode it. */
export const CONVERTIBLE_IMAGE_EXTENSIONS: readonly string[] = ['jpg', 'png', 'webp'];

/** Longest edge in pixels — about 240 dpi across an A4 page, sharp enough to read small print. */
const MAX_EDGE = 2000;
const JPEG_QUALITY = 80;

/** Same decompression-bomb guard as the chat images (`image-compress.ts`). */
const MAX_INPUT_PIXELS = 40_000_000;

/** A4 in PDF points, and the white border every page keeps. */
const A4 = { width: 595.28, height: 841.89 } as const;
const MARGIN = 24;

interface PreparedPage {
  jpeg: Buffer;
  width: number;
  height: number;
}

export async function imagesToPdf(images: { buffer: Buffer; name: string }[]): Promise<Buffer> {
  const pages: PreparedPage[] = [];
  for (const image of images) pages.push(await preparePage(image));
  return render(pages);
}

async function preparePage(image: { buffer: Buffer; name: string }): Promise<PreparedPage> {
  try {
    // `flatten` gives a transparent PNG a white page instead of a black one.
    const { data, info } = await sharp(image.buffer, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { jpeg: data, width: info.width, height: info.height };
  } catch {
    throw new BadRequestException(`"${image.name}" зургийг PDF болгож чадсангүй — өөр зураг оролдоно уу`);
  }
}

/** One A4 page per photo, turned landscape for a landscape photo, the picture fitted and centred. */
function render(pages: PreparedPage[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, info: { Title: 'Материал' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    for (const page of pages) {
      const landscape = page.width > page.height;
      const width = landscape ? A4.height : A4.width;
      const height = landscape ? A4.width : A4.height;
      doc.addPage({ size: [width, height], margin: 0 });
      doc.image(page.jpeg, MARGIN, MARGIN, {
        fit: [width - MARGIN * 2, height - MARGIN * 2],
        align: 'center',
        valign: 'center',
      });
    }
    doc.end();
  });
}
