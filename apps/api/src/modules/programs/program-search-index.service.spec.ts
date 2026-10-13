import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ProgramSearchIndex } from './program-search-index.service.js';
import { programSearchWhere } from './programs.service.js';

type Row = {
  id: string;
  nameMn: string | null;
  nameEn: string | null;
  nameKo: string | null;
  faculty: { nameMn: string | null; nameEn: string | null; nameKo: string | null } | null;
};

const row = (id: string, nameEn: string, nameKo = '', faculty: Row['faculty'] = null): Row => ({
  id,
  nameMn: null,
  nameEn,
  nameKo,
  faculty,
});

const CATALOGUE: Row[] = [
  row('cs', 'Computer Science and Engineering', '컴퓨터공학과'),
  row('ai', 'AI Convergence', 'AI융합학부'),
  row('arch', 'Architecture', '건축학과'),
  row('sec', 'Information Security', '정보보호학과'),
  row('acc', 'Accounting', '회계학과'),
  row('pol', 'Political Science', '정치외교학과'),
  // Found only through its college.
  row('conv', 'Convergence Major', '융합전공', { nameMn: null, nameEn: 'College of Software', nameKo: '소프트웨어대학' }),
];

function indexOver(rows: Row[]) {
  const findMany = vi.fn(async () => rows);
  const index = new ProgramSearchIndex({ universityProgram: { findMany } } as unknown as PrismaService);
  return { index, findMany };
}

describe('ProgramSearchIndex (1I-15)', () => {
  it('answers "IT" with the computing programmes — and not with "Arch-it-ecture" or "Polit-ical"', async () => {
    const { index } = indexOver(CATALOGUE);
    expect((await index.matchingIds('IT')).sort()).toEqual(['ai', 'conv', 'cs', 'sec']);
  });

  it('answers the profession with the subject', async () => {
    const { index } = indexOver(CATALOGUE);
    expect(await index.matchingIds('нягтлан бодогчоор сурмаар байна')).toEqual(['acc']);
  });

  it('still finds a word that belongs to no field by its own letters', async () => {
    const { index } = indexOver(CATALOGUE);
    expect(await index.matchingIds('political')).toEqual(['pol']);
  });

  it('reads the catalogue once, and serves a repeated query from memory', async () => {
    const { index, findMany } = indexOver(CATALOGUE);
    await index.matchingIds('IT');
    await index.matchingIds('it');
    await index.matchingIds('accounting');
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('reads the names again after a write, before answering', async () => {
    const rows = [...CATALOGUE];
    const { index, findMany } = indexOver(rows);
    expect(await index.matchingIds('회계')).toEqual(['acc']);

    rows.push(row('tax', 'Accounting and Taxation', '회계세무학과'));
    index.invalidate();
    expect(await index.matchingIds('회계')).toEqual(['acc', 'tax']);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('keeps answering with the names it has when a reload fails', async () => {
    const findMany = vi.fn().mockResolvedValueOnce(CATALOGUE).mockRejectedValueOnce(new Error('connection reset'));
    const index = new ProgramSearchIndex({ universityProgram: { findMany } } as unknown as PrismaService);
    expect(await index.matchingIds('회계')).toEqual(['acc']);

    index.invalidate();
    expect(await index.matchingIds('회계')).toEqual(['acc']);
  });
});

describe('programSearchWhere (1I-15)', () => {
  const schoolCondition = (where: ReturnType<typeof programSearchWhere>) =>
    (where.OR ?? []).filter((condition) => 'university' in condition);

  it('narrows to the matched ids, and searches school names by the typed word only', () => {
    const where = programSearchWhere('компьютер', ['cs']);
    expect(where.OR).toContainEqual({ id: { in: ['cs'] } });
    expect(JSON.stringify(schoolCondition(where))).toContain('компьютер');
  });

  it('keeps short words off school names — "IT" is inside "University"', () => {
    expect(schoolCondition(programSearchWhere('IT', ['cs']))).toHaveLength(0);
  });

  it('matches everything for a blank term, as before', () => {
    expect(programSearchWhere('   ', [])).toEqual({});
  });
});
