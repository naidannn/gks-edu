import type { QuestionnaireDefinition } from '@gks/shared';
import { describe, expect, it } from 'vitest';
import {
  answersPatch,
  minutesLeft,
  questionnaireProgress,
  questionnaireSteps,
  recommendationLink,
  sectionProgress,
  teacherMessage,
} from '../app/utils/questionnaire';

const DEFINITION: QuestionnaireDefinition = {
  kind: 'ESSAY',
  level: 'BACHELOR',
  title: 'Тест',
  intro: [],
  parts: [
    {
      id: 'ps',
      title: 'Өөрийн танилцуулга',
      sections: [
        {
          id: 'a',
          title: 'A',
          minutes: 4,
          questions: [
            { id: 'major', required: true, label: 'Мэргэжил' },
            { id: 'hasWork', kind: 'yesno', label: 'Ажил хийж байсан уу?' },
            { id: 'work', label: 'Ажил', showIf: { id: 'hasWork', equals: 'yes' } },
          ],
        },
      ],
    },
    { id: 'sp', title: 'Суралцах төлөвлөгөө', sections: [{ id: 'b', title: 'B', minutes: 2, questions: [{ id: 'goal', label: 'Зорилго' }] }] },
  ],
};

describe('questionnaire progress (web mirror of the API)', () => {
  it('counts a gated follow-up only once the gate says yes', () => {
    const section = DEFINITION.parts[0]!.sections[0]!;
    expect(sectionProgress(section, {}).total).toBe(2);
    expect(sectionProgress(section, { hasWork: 'no' }).total).toBe(2);
    expect(sectionProgress(section, { hasWork: 'yes' }).total).toBe(3);
  });

  it('adds up across parts and lists what blocks submission', () => {
    expect(questionnaireProgress(DEFINITION, { goal: 'x' })).toEqual({ answered: 1, total: 3, missingRequired: ['major'] });
  });

  it('estimates the minutes left from unfinished sections only', () => {
    expect(minutesLeft(DEFINITION, {})).toBe(6);
    expect(minutesLeft(DEFINITION, { goal: 'x' })).toBe(4);
  });

  it('turns every section into a step and marks where each part begins', () => {
    const steps = questionnaireSteps(DEFINITION);
    expect(steps.map((step) => step.key)).toEqual(['ps.a', 'sp.b']);
    expect(steps.every((step) => step.opensPart)).toBe(true);
  });
});

describe('answersPatch — what the autosave sends', () => {
  it('sends changed answers only, and a cleared one as an empty string', () => {
    expect(answersPatch({ a: '1', b: '2', c: '3' }, { a: '1', b: '22' })).toEqual({ b: '22', c: '' });
  });

  it('sends nothing when nothing changed', () => {
    expect(answersPatch({ a: '1' }, { a: '1' })).toEqual({});
  });
});

describe('the teacher’s link and message', () => {
  it('builds the link on the current host', () => {
    expect(recommendationLink('https://gksedu.mn/', 'abc')).toBe('https://gksedu.mn/recommend/abc');
  });

  it('writes a message that names the level and says Mongolian is fine', () => {
    const text = teacherMessage({ applicantName: 'Бат Болд', teacherName: 'Сарангэрэл багш', level: 'MASTER', link: 'L' });
    expect(text).toContain('Сайн байна уу, Сарангэрэл багш.');
    expect(text).toContain('магистрын');
    expect(text).toContain('монголоор');
    expect(text).toContain('L');
  });
});
