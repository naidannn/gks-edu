import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imagesToPdf } from './image-to-pdf.js';

/** The `/MediaBox [0 0 w h]` of every page, in order. */
function mediaBoxes(pdf: Buffer): number[][] {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('imagesToPdf (1D-32)', () => {
  it('lays a landscape photo on a landscape A4 page and a portrait one on a portrait page', async () => {
    const wide = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const tall = await sharp({ create: { width: 200, height: 400, channels: 3, background: '#fff' } }).png().toBuffer();

    const pdf = await imagesToPdf([{ buffer: wide, name: 'a.jpg' }, { buffer: tall, name: 'b.png' }]);

    expect(mediaBoxes(pdf)).toEqual([
      [841.89, 595.28],
      [595.28, 841.89],
    ]);
  });

  it('applies the EXIF orientation — a phone portrait shot is stored sideways with a rotate flag', async () => {
    // 400×200 pixels flagged "rotate 90°": the person saw a 200×400 portrait.
    const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#fff' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const pdf = await imagesToPdf([{ buffer: sideways, name: 'IMG_0001.jpg' }]);

    expect(mediaBoxes(pdf)).toEqual([[595.28, 841.89]]);
  });

  it('names the photo it cannot read', async () => {
    await expect(imagesToPdf([{ buffer: Buffer.from('not an image'), name: 'broken.png' }])).rejects.toThrow(/broken\.png/);
  });
});
