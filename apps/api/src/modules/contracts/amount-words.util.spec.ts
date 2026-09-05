import { describe, expect, it } from 'vitest';
import { amountInWordsMn, amountInWordsMnCapitalized } from './amount-words.util.js';

describe('amountInWordsMn', () => {
  it('spells the amounts the signed Word contract carries', () => {
    expect(amountInWordsMn(5_000_000)).toBe('таван сая');
    expect(amountInWordsMn(3_500_000)).toBe('гурван сая таван зуун мянга');
    expect(amountInWordsMn(1_500_000)).toBe('нэг сая таван зуун мянга');
  });

  it('spells the other configured prices', () => {
    expect(amountInWordsMn(1_200_000)).toBe('нэг сая хоёр зуун мянга');
    expect(amountInWordsMn(200_000)).toBe('хоёр зуун мянга');
    expect(amountInWordsMn(1_000_000)).toBe('нэг сая');
  });

  it('uses the attributive form everywhere but the last word', () => {
    expect(amountInWordsMn(4_750_000)).toBe('дөрвөн сая долоон зуун тавин мянга');
    expect(amountInWordsMn(35)).toBe('гучин тав');
    expect(amountInWordsMn(300)).toBe('гурван зуу');
    expect(amountInWordsMn(1_234_567)).toBe('нэг сая хоёр зуун гучин дөрвөн мянга таван зуун жаран долоо');
  });

  it('skips empty groups instead of writing a bare scale word', () => {
    expect(amountInWordsMn(2_000_045)).toBe('хоёр сая дөчин тав');
    expect(amountInWordsMn(1_000_000_000)).toBe('нэг тэрбум');
  });

  it('accepts Decimal-like values and rounds the fraction away', () => {
    expect(amountInWordsMn('5000000')).toBe('таван сая');
    expect(amountInWordsMn({ toString: () => '1500000.00' })).toBe('нэг сая таван зуун мянга');
    expect(amountInWordsMn(199_999.6)).toBe('хоёр зуун мянга');
  });

  it('handles the edges', () => {
    expect(amountInWordsMn(0)).toBe('тэг');
    expect(amountInWordsMn(-500)).toBe('хасах таван зуу');
  });

  it('capitalises only the first letter', () => {
    expect(amountInWordsMnCapitalized(5_000_000)).toBe('Таван сая');
    expect(amountInWordsMnCapitalized(3_500_000)).toBe('Гурван сая таван зуун мянга');
  });
});
