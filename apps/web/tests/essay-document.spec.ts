import type { QuestionnaireDefinition } from '@gks/shared';
import { describe, expect, it } from 'vitest';
import { countWords, essayDefinitionFor, essayFileName, essayOutlineHtml, wordDocumentHtml } from '../app/utils/essay-document';

const definition: QuestionnaireDefinition = {
  kind: 'ESSAY',
  level: 'BACHELOR',
  title: 'Эссэ',
  intro: [],
  parts: [
    { id: 'ps', title: 'Өөрийн танилцуулга', titleEn: 'Personal Statement', sections: [{ id: 'a', title: 'Гэр бүл', questions: [] }] },
    {
      id: 'sp',
      title: 'Суралцах төлөвлөгөө',
      titleEn: 'Study Plan',
      sections: [
        { id: 'b', title: 'Хэл', titleEn: 'Language Study Plan', questions: [] },
        { id: 'c', title: 'Хэл (өөр)', titleEn: 'Language Study Plan', questions: [] },
        { id: 'd', title: 'Ирээдүй', titleEn: 'Future Plan <after> Study', questions: [] },
      ],
    },
  ],
};

describe('essay documents (1D-28)', () => {
  it('gives the writer the questionnaire part behind each essay', () => {
    expect(essayDefinitionFor(definition, 'STUDY_PLAN').parts.map((part) => part.id)).toEqual(['sp']);
    expect(essayDefinitionFor(definition, 'PERSONAL_STATEMENT').parts.map((part) => part.id)).toEqual(['ps']);
  });

  it('outlines an essay from the English section titles, once each, escaped', () => {
    expect(essayOutlineHtml(definition, 'STUDY_PLAN')).toBe(
      '<h2>Language Study Plan</h2><p></p><h2>Future Plan &lt;after&gt; Study</h2><p></p>',
    );
    expect(essayOutlineHtml(definition, 'PERSONAL_STATEMENT')).toBe('');
  });

  it('counts words the way the form does', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('  I want to\nstudy  in 한국 ')).toBe(6);
  });

  it('wraps the essay into a document Word opens', () => {
    const html = wordDocumentHtml('Personal <Statement>', '<p>Hi</p>');
    expect(html).toContain('urn:schemas-microsoft-com:office:word');
    expect(html).toContain('<title>Personal &lt;Statement&gt;</title>');
    expect(html).toContain('<body><p>Hi</p></body>');
  });

  it('names the file after the applicant', () => {
    expect(essayFileName('Бат Болд', 'Study Plan')).toBe('Бат_Болд_Study_Plan.doc');
    expect(essayFileName('A/B', 'x')).toBe('AB_x.doc');
  });
});
