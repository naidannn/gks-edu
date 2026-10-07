import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Photos as people send them — a 12-megapixel phone shot, 4–8MB — are far
 * more than a chat bubble needs. Everything is re-encoded to WebP on the way
 * in (1K-11), so the bucket never stores the original:
 *
 * - **full** — longest edge 1600px at q75. Sharp enough to read a document
 *   photographed on a desk, typically 100–250KB.
 * - **thumb** — longest edge 640px at q70, what the thread actually renders
 *   (a bubble is ≤ 320 CSS px wide, so 640 covers a 2× screen). 20–50KB.
 *
 * Re-encoding also drops EXIF, which on a phone photo includes the GPS
 * position of wherever it was taken. `rotate()` applies the EXIF orientation
 * first, or a portrait shot would arrive lying on its side.
 */
const FULL = { edge: 1600, quality: 75 } as const;
const THUMB = { edge: 640, quality: 70 } as const;

/**
 * A decompression-bomb guard: a tiny PNG can declare 50000×50000 pixels.
 * 40MP is above any phone camera and far below what would exhaust the box.
 */
const MAX_INPUT_PIXELS = 40_000_000;

/** What `sharp` reports for the inputs we take. HEIC is absent: the prebuilt libvips cannot decode it. */
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif']);

export interface CompressedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

export interface CompressedImagePair {
  full: CompressedImage;
  thumb: CompressedImage;
}

export async function compressImage(input: Buffer): Promise<CompressedImagePair> {
  let format: string | undefined;
  try {
    ({ format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata());
  } catch {
    throw new BadRequestException('Зургийг уншиж чадсангүй — JPG, PNG эсвэл WebP файл илгээнэ үү');
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    throw new BadRequestException('Зөвхөн JPG, PNG, WebP зураг илгээнэ үү');
  }

  const [full, thumb] = await Promise.all([encode(input, FULL), encode(input, THUMB)]);
  return { full, thumb };
}

async function encode(
  input: Buffer,
  target: { edge: number; quality: number },
): Promise<CompressedImage> {
  try {
    // `animated: false` keeps only the first frame of a GIF — a chat photo, not a clip.
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize(target.edge, target.edge, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: target.quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new BadRequestException('Зургийг боловсруулж чадсангүй — өөр зураг оролдоно уу');
  }
}
