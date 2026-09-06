import { describe, expect, it } from 'vitest';
import { toTemplateCode, uniqueTemplateCode } from './template-code.js';

describe('the code a hand-written material gets', () => {
  it('transliterates the Mongolian name', () => {
    expect(toTemplateCode('Банкны тодорхойлолт')).toBe('BANKNY_TODORKHOILOLT');
    expect(toTemplateCode('Эрүүл мэндийн хуудас')).toBe('ERUUL_MENDIIN_KHUUDAS');
  });

  it('keeps the shape the admin form validates', () => {
    for (const name of ['20,000 ам.доллар', '!!!', 'ъ', 'Ажлын газрын тодорхойлолт (эх хувь)']) {
      expect(toTemplateCode(name)).toMatch(/^[A-Z][A-Z0-9_]{1,63}$/);
    }
  });

  it('starts a name with no letters in it from the fallback', () => {
    expect(toTemplateCode('2026')).toBe('CUSTOM_2026');
  });

  it('numbers a code the register already holds', () => {
    expect(uniqueTemplateCode('PASSPORT', [])).toBe('PASSPORT');
    expect(uniqueTemplateCode('PASSPORT', ['PASSPORT'])).toBe('PASSPORT_2');
    expect(uniqueTemplateCode('PASSPORT', ['PASSPORT', 'PASSPORT_2'])).toBe('PASSPORT_3');
  });
});
