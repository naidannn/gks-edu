import { ESSAY_BACHELOR } from './essay-bachelor.js';
import { ESSAY_MASTER } from './essay-master.js';
import { ESSAY_PHD } from './essay-phd.js';
import { RECOMMENDATION_BACHELOR, RECOMMENDATION_MASTER, RECOMMENDATION_PHD } from './recommendation.js';
import type {
  Question,
  QuestionnaireDefinition,
  QuestionnaireLevel,
  RecommendationDefinition,
  RecommenderField,
} from './types.js';

export * from './types.js';

const ESSAYS: Record<QuestionnaireLevel, QuestionnaireDefinition> = {
  BACHELOR: ESSAY_BACHELOR,
  MASTER: ESSAY_MASTER,
  PHD: ESSAY_PHD,
};

const RECOMMENDATIONS: Record<QuestionnaireLevel, RecommendationDefinition> = {
  BACHELOR: RECOMMENDATION_BACHELOR,
  MASTER: RECOMMENDATION_MASTER,
  PHD: RECOMMENDATION_PHD,
};

export function essayDefinition(level: QuestionnaireLevel): QuestionnaireDefinition {
  return ESSAYS[level];
}

export function recommendationDefinition(level: QuestionnaireLevel): RecommendationDefinition {
  return RECOMMENDATIONS[level];
}

/** Every definition, for the tests that hold the whole set to its invariants. */
export const ALL_DEFINITIONS: readonly QuestionnaireDefinition[] = [
  ...Object.values(ESSAYS),
  ...Object.values(RECOMMENDATIONS),
];

/** The longest answer kept — about four pages of Mongolian, far past anything useful. */
export const MAX_ANSWER_LENGTH = 8000;

export type Answers = Record<string, string>;

export function allQuestions(definition: QuestionnaireDefinition): Question[] {
  return definition.parts.flatMap((part) => part.sections.flatMap((section) => [...section.questions]));
}

/**
 * Whether a question is asked, given the answers so far. A gated question whose
 * gate is unanswered stays hidden: "Та ажил хийж байсан уу?" comes first.
 */
export function isVisible(question: Question, answers: Answers): boolean {
  return !question.showIf || answers[question.showIf.id] === question.showIf.equals;
}

export function isAnswered(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface QuestionnaireProgress {
  answered: number;
  total: number;
  /** Required questions still empty — submission waits on these, nothing else. */
  missingRequired: string[];
}

/** Counts only questions that are asked: a "no" at a gate removes its follow-ups from the total. */
export function questionnaireProgress(definition: QuestionnaireDefinition, answers: Answers): QuestionnaireProgress {
  const asked = allQuestions(definition).filter((question) => isVisible(question, answers));
  return {
    answered: asked.filter((question) => isAnswered(answers[question.id])).length,
    total: asked.length,
    missingRequired: asked
      .filter((question) => question.required && !isAnswered(answers[question.id]))
      .map((question) => question.id),
  };
}

/**
 * Keeps only answers to questions this definition asks, as trimmed-at-the-end
 * strings under the length cap. An autosave from a stale tab, or a hand-made
 * request, cannot plant keys the office would then read as answers.
 *
 * Answers to questions a gate has since hidden are kept on purpose: flipping
 * "Тийм" → "Үгүй" → "Тийм" by mistake must not erase a paragraph.
 */
export function sanitizeAnswers(definition: QuestionnaireDefinition, raw: unknown): Answers {
  const known = new Map(allQuestions(definition).map((question) => [question.id, question]));
  return cleanRecord(raw, (id, value) => {
    const question = known.get(id);
    if (!question) return undefined;
    if (question.kind === 'yesno') return value === 'yes' || value === 'no' ? value : undefined;
    if (question.kind === 'choice') return question.options?.includes(value) ? value : undefined;
    return value;
  });
}

/** The same cleaning for section V — the recommender's own details. */
export function sanitizeRecommender(fields: readonly RecommenderField[], raw: unknown): Answers {
  const known = new Set(fields.map((field) => field.id));
  return cleanRecord(raw, (id, value) => (known.has(id) ? value.slice(0, 300) : undefined));
}

export function missingRecommenderFields(fields: readonly RecommenderField[], values: Answers): string[] {
  return fields.filter((field) => field.required && !isAnswered(values[field.id])).map((field) => field.id);
}

function cleanRecord(raw: unknown, keep: (id: string, value: string) => string | undefined): Answers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Answers = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+$/u, '').slice(0, MAX_ANSWER_LENGTH);
    if (!trimmed) continue;
    const kept = keep(id, trimmed);
    if (kept !== undefined) out[id] = kept;
  }
  return out;
}

/**
 * The whole questionnaire as plain text, in order, for the writer to paste
 * into a draft. Unasked questions are left out; unanswered ones say so, because
 * "the client skipped this" is information too.
 */
export function answersAsText(definition: QuestionnaireDefinition, answers: Answers): string {
  const lines: string[] = [definition.title.toUpperCase(), ''];
  for (const part of definition.parts) {
    lines.push(`═══ ${part.title}${part.titleEn ? ` (${part.titleEn})` : ''} ═══`, '');
    for (const section of part.sections) {
      lines.push(`── ${section.title}${section.titleEn ? ` (${section.titleEn})` : ''}`, '');
      for (const question of section.questions) {
        if (!isVisible(question, answers)) continue;
        const value = answers[question.id];
        lines.push(`• ${question.label}`, isAnswered(value) ? displayValue(question, value!) : '(хариулаагүй)', '');
      }
    }
  }
  return lines.join('\n').trimEnd();
}

function displayValue(question: Question, value: string): string {
  if (question.kind === 'yesno') return value === 'yes' ? 'Тийм' : 'Үгүй';
  return value.trim();
}
