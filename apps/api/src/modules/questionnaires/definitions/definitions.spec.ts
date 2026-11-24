import { describe, expect, it } from 'vitest';
import {
  ALL_DEFINITIONS,
  allQuestions,
  answersAsText,
  essayDefinition,
  asksHighSchool,
  MAX_ANSWER_LENGTH,
  missingRecommenderFields,
  PROFILE_QUESTIONS,
  profileDefinition,
  questionnaireProgress,
  recommendationDefinition,
  sanitizeAnswers,
  sanitizeRecommender,
} from './index.js';
import { suggestQuestionnaireLevel } from '../questionnaire-level.js';

/**
 * An answer is stored under its question's id, so every definition has to hold
 * a few invariants the type system cannot see. A duplicate id would silently
 * make two questions share one answer.
 */
describe.each([
  ...ALL_DEFINITIONS.map((definition) => [`${definition.kind} ${definition.level} «${definition.title}»`, definition] as const),
  ['PROFILE', PROFILE_QUESTIONS] as const,
])(
  'questionnaire %s',
  (_name, definition) => {
    const questions = allQuestions(definition);

    it('gives every question a unique id', () => {
      const ids = questions.map((question) => question.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('gates a question only on an earlier yes/no question', () => {
      questions.forEach((question, index) => {
        if (!question.showIf) return;
        const gateIndex = questions.findIndex((candidate) => candidate.id === question.showIf!.id);
        expect(gateIndex, `${question.id} → ${question.showIf.id}`).toBeGreaterThanOrEqual(0);
        expect(gateIndex).toBeLessThan(index);
        expect(questions[gateIndex]!.kind).toBe('yesno');
      });
    });

    it('never makes a gated question required — "no" at the gate must let the form be sent', () => {
      expect(questions.filter((question) => question.showIf && question.required)).toEqual([]);
    });

    it('gives every choice question its options', () => {
      for (const question of questions.filter((q) => q.kind === 'choice')) {
        expect(question.options?.length, question.id).toBeGreaterThan(1);
      }
    });

    it('has at least one required question, and at most a third of them', () => {
      const required = questions.filter((question) => question.required).length;
      expect(required).toBeGreaterThan(0);
      expect(required).toBeLessThanOrEqual(Math.ceil(questions.length / 3));
    });
  },
);

describe('the essay sets differ by level', () => {
  it('asks a doctoral applicant for a research plan and a bachelor applicant for none', () => {
    const ids = (level: 'BACHELOR' | 'PHD') => allQuestions(essayDefinition(level, 'GKS')).map((question) => question.id);
    expect(ids('PHD')).toContain('proposedTopic');
    expect(ids('BACHELOR')).not.toContain('proposedTopic');
    // The office's doctoral file was a copy of the bachelor one; this is the guard.
    expect(ids('PHD')).not.toContain('years12');
  });

  it('asks for one teacher at bachelor level and two above it', () => {
    expect(recommendationDefinition('BACHELOR').lettersNeeded).toBe(1);
    expect(recommendationDefinition('MASTER').lettersNeeded).toBe(2);
    expect(recommendationDefinition('PHD').lettersNeeded).toBe(2);
  });
});

describe('the profile questionnaire (1B-29)', () => {
  const ids = (asks: boolean) => allQuestions(profileDefinition({ asksHighSchool: asks })).map((question) => question.id);

  it('asks for the high school only where a school-leaving certificate is what the client applies on', () => {
    expect(asksHighSchool({ serviceTypes: ['LANGUAGE_PREP'] })).toBe(true);
    expect(asksHighSchool({ serviceTypes: ['BACHELOR'] })).toBe(true);
    expect(asksHighSchool({ serviceTypes: ['MASTER'] })).toBe(false);
    expect(asksHighSchool({ serviceTypes: ['GKS_SCHOLARSHIP'], educationLevel: 'SECONDARY_SCHOOL' })).toBe(true);
    expect(asksHighSchool({ serviceTypes: ['GKS_SCHOLARSHIP'], educationLevel: 'BACHELOR' })).toBe(false);
    expect(ids(true)).toContain('hs_address');
    expect(ids(false)).not.toContain('hs_address');
  });

  it('asks every client about the family, the sponsor and the dormitory', () => {
    for (const id of ['father_occupation', 'mother_income', 'sponsor_other', 'dorm']) expect(ids(false)).toContain(id);
  });

  it('keeps a high-school answer when the set no longer asks it', () => {
    expect(sanitizeAnswers(PROFILE_QUESTIONS, { hs_name: '1-р сургууль', made_up: 'x' })).toEqual({ hs_name: '1-р сургууль' });
  });
});

describe('questionnaireProgress', () => {
  const definition = essayDefinition('BACHELOR', 'GKS');

  it('drops the follow-ups of a "no" from the total instead of counting them as missing', () => {
    const before = questionnaireProgress(definition, {}).total;
    const withWork = questionnaireProgress(definition, { hasWork: 'yes' }).total;
    const withoutWork = questionnaireProgress(definition, { hasWork: 'no' }).total;
    expect(withWork).toBe(before + 3);
    expect(withoutWork).toBe(before);
  });

  it('counts whitespace as unanswered', () => {
    const progress = questionnaireProgress(definition, { major: '   ' });
    expect(progress.answered).toBe(0);
    expect(progress.missingRequired).toContain('major');
  });

  it('is complete for submission once every required question has an answer', () => {
    const answers = Object.fromEntries(
      allQuestions(definition)
        .filter((question) => question.required)
        .map((question) => [question.id, question.options?.[0] ?? 'хариулт']),
    );
    expect(questionnaireProgress(definition, answers).missingRequired).toEqual([]);
  });
});

describe('sanitizeAnswers', () => {
  const definition = essayDefinition('BACHELOR', 'GKS');

  it('keeps only questions the set asks, as strings', () => {
    expect(sanitizeAnswers(definition, { major: 'Хими', invented: 'x', majorWhy: 42 })).toEqual({ major: 'Хими' });
  });

  it('clears an answer sent as an empty string — how the autosave erases', () => {
    expect(sanitizeAnswers(definition, { major: '' })).toEqual({});
  });

  it('accepts only yes/no at a gate and only a listed option for a choice', () => {
    expect(sanitizeAnswers(definition, { hasWork: 'maybe', koreanLevel: 'Гайхалтай' })).toEqual({});
    expect(sanitizeAnswers(definition, { hasWork: 'no', koreanLevel: 'Анхан шат' })).toEqual({
      hasWork: 'no',
      koreanLevel: 'Анхан шат',
    });
  });

  it('keeps an answer a gate has since hidden, so a mis-click does not erase a paragraph', () => {
    expect(sanitizeAnswers(definition, { hasWork: 'no', workDetails: 'Номын дэлгүүр' })).toMatchObject({
      workDetails: 'Номын дэлгүүр',
    });
  });

  it('caps a runaway answer and trims trailing whitespace only', () => {
    const cleaned = sanitizeAnswers(definition, { majorWhy: `  эхлэл${'а'.repeat(MAX_ANSWER_LENGTH)}` });
    expect(cleaned.majorWhy!.startsWith('  эхлэл')).toBe(true);
    expect(cleaned.majorWhy!.length).toBe(MAX_ANSWER_LENGTH);
  });

  it('rejects anything that is not a plain object', () => {
    expect(sanitizeAnswers(definition, ['major'])).toEqual({});
    expect(sanitizeAnswers(definition, null)).toEqual({});
  });
});

describe('recommender details', () => {
  const fields = recommendationDefinition('MASTER').recommenderFields;

  it('keeps known fields and lists the required ones still empty', () => {
    const values = sanitizeRecommender(fields, { name: 'Б. Болд', hacker: 'x' });
    expect(values).toEqual({ name: 'Б. Болд' });
    expect(missingRecommenderFields(fields, values)).toEqual(['position', 'institution', 'email', 'phone']);
  });
});

describe('answersAsText — the writer’s copy', () => {
  it('prints asked questions in order and says which were skipped', () => {
    const text = answersAsText(essayDefinition('BACHELOR', 'GKS'), { major: 'Хими', hasWork: 'no' });
    expect(text).toContain('Хими');
    expect(text).toContain('Үгүй');
    expect(text).toContain('(хариулаагүй)');
    expect(text).not.toContain('Байгууллагын нэр, ажилласан хугацаа');
    expect(text.indexOf('Personal Statement')).toBeLessThan(text.indexOf('Study Plan'));
  });
});

describe('suggestQuestionnaireLevel', () => {
  it('trusts the chosen programme first', () => {
    expect(suggestQuestionnaireLevel({ programLevel: 'MASTER', educationLevel: 'SECONDARY_SCHOOL' })).toBe('MASTER');
  });

  it('ignores a language-prep programme and falls back to the next degree up', () => {
    expect(suggestQuestionnaireLevel({ programLevel: 'LANGUAGE_PREP', educationLevel: 'BACHELOR' })).toBe('MASTER');
    expect(suggestQuestionnaireLevel({ educationLevel: 'SECONDARY_SCHOOL' })).toBe('BACHELOR');
    expect(suggestQuestionnaireLevel({ educationLevel: 'MASTER' })).toBe('PHD');
  });

  it('asks rather than guesses when nothing is known', () => {
    expect(suggestQuestionnaireLevel({})).toBeNull();
  });
});

describe('the regular essay sets (1D-33)', () => {
  const ids = (level: 'BACHELOR' | 'MASTER' | 'PHD' | 'LANGUAGE_PREP') =>
    allQuestions(essayDefinition(level, 'REGULAR')).map((question) => question.id);

  it('asks bachelor, master and PhD the same questions', () => {
    expect(ids('MASTER')).toEqual(ids('BACHELOR'));
    expect(ids('PHD')).toEqual(ids('BACHELOR'));
    expect(essayDefinition('PHD', 'REGULAR').level).toBe('PHD');
  });

  it('asks language prep its own, shorter set — no major, no study goals by year', () => {
    expect(essayDefinition('LANGUAGE_PREP', 'REGULAR').title).toBe('Хэлний бэлтгэлийн эссэ бэлтгэх асуулга');
    expect(ids('LANGUAGE_PREP')).not.toContain('major');
    expect(ids('LANGUAGE_PREP')).not.toContain('years12');
    expect(ids('LANGUAGE_PREP')).toContain('koreaWhy');
    expect(ids('LANGUAGE_PREP').length).toBeLessThan(ids('BACHELOR').length);
  });

  it('has no language-prep set on the GKS track', () => {
    expect(essayDefinition('LANGUAGE_PREP', 'GKS' as 'REGULAR' | 'GKS')).toBeNull();
  });

  it.each(['BACHELOR', 'LANGUAGE_PREP'] as const)('never mentions the scholarship (%s)', (level) => {
    const text = JSON.stringify(essayDefinition(level, 'REGULAR'));
    expect(text).not.toMatch(/GKS|тэтгэлэг/u);
  });

  it.each(['BACHELOR', 'LANGUAGE_PREP'] as const)(
    'reuses the bachelor GKS ids, so a case moved between sets keeps its answers (%s)',
    (level) => {
      const gks = new Set(allQuestions(essayDefinition('BACHELOR', 'GKS')).map((question) => question.id));
      expect(ids(level).filter((id) => !gks.has(id))).toEqual([]);
    },
  );
});
