import { describe, expect, it } from 'vitest';
import { SEARCH_AREAS, expandSearchQuery, searchAreasFor } from './search-vocabulary.js';

const labels = (query: string) => searchAreasFor(query).map((area) => area.label);
const texts = (query: string) => expandSearchQuery(query).map((term) => term.text);
const IT = 'IT, компьютер, хиймэл оюун';
const FINANCE = 'Санхүү, нягтлан бодох бүртгэл, банк';

describe('searchAreasFor (1I-15)', () => {
  it('takes "AI", "программист" and "хиймэл оюун" to the whole of IT, not only to their own word', () => {
    for (const query of ['IT', 'it', 'AI', 'программист', 'хиймэл оюун', 'Computer Science', '컴퓨터공학']) {
      expect(labels(query)).toContain(IT);
    }
    expect(texts('AI')).toEqual(expect.arrayContaining(['компьютер', 'software', '컴퓨터', 'хиймэл оюун']));
  });

  it('understands the profession as well as the subject — the words people actually type', () => {
    expect(labels('нягтлан бодогч')).toContain(FINANCE);
    expect(labels('санхүүч')).toContain(FINANCE);
    expect(texts('нягтлан бодогч')).toEqual(expect.arrayContaining(['нягтлан бодох', 'accounting', '회계']));
  });

  it('carries Mongolian suffixes and whole sentences', () => {
    expect(labels('санхүүгээр')).toContain(FINANCE);
    expect(labels('нягтлан бодогчоор сурмаар байна')).toContain(FINANCE);
    expect(labels('хиймэл оюун ухаанаар сурах')).toContain(IT);
    expect(labels('IT-ээр сурах')).toContain(IT);
  });

  it('never reads a short key out of the middle or the start of another word', () => {
    expect(labels('итгэл')).not.toContain(IT);
    expect(labels('aid')).not.toContain(IT);
    expect(labels('кит')).not.toContain(IT);
  });

  it('can name more than one field, and names none for an unknown word', () => {
    expect(labels('барилга')).toEqual(expect.arrayContaining(['Архитектур', 'Барилга, иргэний инженерчлэл']));
    expect(labels('асдфгх')).toEqual([]);
    expect(labels('   ')).toEqual([]);
  });

  it('keeps every `asked` word lower case, or it could never match', () => {
    for (const area of SEARCH_AREAS) {
      for (const word of area.asked) expect(word, area.label).toBe(word.toLowerCase().trim());
    }
  });
});

describe('expandSearchQuery (1I-15)', () => {
  it('puts the typed word first and matches a two-letter acronym in capitals only', () => {
    const [typed] = expandSearchQuery('it');
    expect(typed).toEqual({ text: 'IT', caseSensitive: true });
  });

  it('marks a capitalised acronym in the vocabulary case-sensitive, and nothing else', () => {
    const terms = expandSearchQuery('AI');
    expect(terms.find((term) => term.text === 'AI')?.caseSensitive).toBe(true);
    expect(terms.find((term) => term.text === 'computer')?.caseSensitive).toBe(false);
  });

  it('treats a three-letter word as a word: "law" must still find "Law"', () => {
    expect(expandSearchQuery('law')[0]).toEqual({ text: 'law', caseSensitive: false });
  });

  it('lists each fragment once', () => {
    const keys = expandSearchQuery('IT компьютер').map((term) => term.text.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is only the word itself when it belongs to no field', () => {
    expect(expandSearchQuery(' Hanyang ')).toEqual([{ text: 'Hanyang', caseSensitive: false }]);
    expect(expandSearchQuery('')).toEqual([]);
  });
});

