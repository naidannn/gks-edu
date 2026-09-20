/**
 * The shape of one questionnaire (1D-27, ARCHITECTURE.md §7.6).
 *
 * The questions are code, not rows: the office wrote them once per level, they
 * change with the GKS guideline rather than weekly, and every answer is keyed by
 * a question's `id` — so an id is a contract with the stored data. Rename the
 * label freely; never reuse or rename an id.
 *
 * Mirrored for the web in `packages/shared/src/types/questionnaires.ts`.
 */

export type QuestionnaireLevel = 'BACHELOR' | 'MASTER' | 'PHD';

export const QUESTIONNAIRE_LEVELS: readonly QuestionnaireLevel[] = ['BACHELOR', 'MASTER', 'PHD'];

/**
 * `long` is a growing textarea, `short` one line, `yesno` a two-button gate
 * that other questions hang off, `choice` one of `options`.
 */
export type QuestionKind = 'long' | 'short' | 'yesno' | 'choice';

export interface Question {
  id: string;
  label: string;
  /** One line under the label: what a good answer contains. */
  hint?: string;
  /** A worked example, shown greyed inside the empty field. */
  placeholder?: string;
  kind?: QuestionKind;
  options?: readonly string[];
  required?: boolean;
  /** Asked only when another answer in the same questionnaire equals this. */
  showIf?: { id: string; equals: string };
  /** A subheading printed above this question ("БНСУ-д очихоос өмнө"). */
  group?: string;
}

export interface QuestionSection {
  id: string;
  title: string;
  /** The heading this section feeds in the English document, e.g. "Language Study Plan". */
  titleEn?: string;
  /** Why we ask — which part of the essay or letter the answers become. */
  purpose?: string;
  /** A warning the office wants read before answering (honesty about money …). */
  note?: string;
  /** Rough minutes to answer, so a long form never feels endless. */
  minutes?: number;
  questions: readonly Question[];
}

export interface QuestionPart {
  id: string;
  title: string;
  titleEn?: string;
  /** The GKS requirement for the finished document — who writes it, how long. */
  requirement?: string;
  sections: readonly QuestionSection[];
}

export type QuestionnaireKind = 'ESSAY' | 'RECOMMENDATION';

export interface QuestionnaireDefinition {
  kind: QuestionnaireKind;
  level: QuestionnaireLevel;
  title: string;
  /** Paragraphs shown before the first question. */
  intro: readonly string[];
  parts: readonly QuestionPart[];
}

/** Section V of the office's recommendation form — who is writing the letter. */
export interface RecommenderField {
  id: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
}

export interface RecommendationDefinition extends QuestionnaireDefinition {
  kind: 'RECOMMENDATION';
  /** The qualities GKS asks every letter to speak to. */
  qualities: readonly string[];
  /** An extra line for this level, e.g. the doctoral emphasis on research. */
  qualitiesNote?: string;
  recommenderFields: readonly RecommenderField[];
  /** How many letters this level's application asks for. */
  lettersNeeded: number;
}
