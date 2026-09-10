import { describe, expect, it } from 'vitest';
import { buildResearchPrompt } from './intake-research.prompt.js';

const subject = {
  nameMn: 'Сөүлийн үндэсний их сургууль',
  nameEn: 'Seoul National University',
  nameKo: '서울대학교',
  cityEn: 'Seoul',
  officialWebsite: 'https://www.snu.ac.kr',
  year: 2027,
  levels: [] as never[],
};

describe('buildResearchPrompt', () => {
  it('orders a search by default', () => {
    const prompt = buildResearchPrompt(subject);
    expect(prompt).toContain('RUN GOOGLE');
    expect(prompt).toContain('SEARCH FIRST, ALWAYS');
  });

  describe('with search off', () => {
    const prompt = buildResearchPrompt(subject, { search: false });

    it('orders no search, so rule 0 cannot empty the list', () => {
      expect(prompt).not.toContain('RUN GOOGLE');
      expect(prompt).not.toContain('SEARCH FIRST, ALWAYS');
      // The searching prompt's rule 0 says an empty search returns an empty
      // list — left in with no tool to run, it returns nothing at all.
      expect(prompt).not.toContain('empty "candidates" list');
      expect(prompt).toContain('NO SEARCH TOOL');
    });

    it('forbids HIGH and allows a null sourceUrl', () => {
      expect(prompt).toContain('never HIGH');
      expect(prompt).toContain('sourceUrl may be null');
      expect(prompt).toContain('"sources" is []');
    });

    it('still pins the school and the year', () => {
      expect(prompt).toContain('서울대학교');
      expect(prompt).toContain('2027');
    });
  });
});
