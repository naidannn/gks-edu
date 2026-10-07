import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { compressImage } from './image-compress.js';

/** A noisy photo-like JPEG — flat colour would compress to nothing and prove little. */
async function photo(width: number, height: number, orientation?: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 7919) % 251;
  const image = sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 });
  return (orientation ? image.withMetadata({ orientation }) : image).toBuffer();
}

describe('compressImage (1K-11)', () => {
  it('shrinks a phone-sized photo to WebP within the two edge limits', async () => {
    const input = await photo(4000, 3000);
    const { full, thumb } = await compressImage(input);

    expect((await sharp(full.buffer).metadata()).format).toBe('webp');
    expect([full.width, full.height]).toEqual([1600, 1200]);
    expect([thumb.width, thumb.height]).toEqual([640, 480]);
    expect(full.buffer.byteLength).toBeLessThan(input.byteLength / 4);
    expect(thumb.buffer.byteLength).toBeLessThan(full.buffer.byteLength);
  });

  it('never enlarges a small image', async () => {
    const { full, thumb } = await compressImage(await photo(300, 200));
    expect([full.width, full.height]).toEqual([300, 200]);
    expect([thumb.width, thumb.height]).toEqual([300, 200]);
  });

  it('applies the EXIF rotation and then drops the metadata', async () => {
    // Orientation 6 = shot in portrait, stored landscape.
    const { full } = await compressImage(await photo(800, 400, 6));
    expect([full.width, full.height]).toEqual([400, 800]);
    const meta = await sharp(full.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it('rejects bytes that are not an image', async () => {
    await expect(compressImage(Buffer.from('%PDF-1.7 not a photo'))).rejects.toThrow('Зургийг уншиж чадсангүй');
  });
});
