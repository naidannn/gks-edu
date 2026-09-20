/**
 * GKS essay and recommendation questionnaires (1D-27). The question sets are
 * defined in the API (`apps/api/src/modules/questionnaires/definitions`) and
 * travel in every payload; these types mirror that module.
 */

export type QuestionnaireLevel = 'BACHELOR' | 'MASTER' | 'PHD';
export type QuestionKind = 'long' | 'short' | 'yesno' | 'choice';
export type QuestionnaireStatus = 'DRAFT' | 'SUBMITTED';
export type RecommendationStatus = 'INVITED' | 'ANSWERED' | 'LETTER_READY' | 'RECEIVED';

/** `{ [questionId]: string }` — every answer is text, a yes/no is `'yes' | 'no'`. */
export type QuestionnaireAnswers = Record<string, string>;

export interface Question {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  kind?: QuestionKind;
  options?: string[];
  required?: boolean;
  showIf?: { id: string; equals: string };
  group?: string;
}

export interface QuestionSection {
  id: string;
  title: string;
  titleEn?: string;
  purpose?: string;
  note?: string;
  minutes?: number;
  questions: Question[];
}

export interface QuestionPart {
  id: string;
  title: string;
  titleEn?: string;
  requirement?: string;
  sections: QuestionSection[];
}

export interface QuestionnaireDefinition {
  kind: 'ESSAY' | 'RECOMMENDATION';
  level: QuestionnaireLevel;
  title: string;
  intro: string[];
  parts: QuestionPart[];
}

export interface RecommenderField {
  id: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
}

export interface RecommendationDefinition extends QuestionnaireDefinition {
  kind: 'RECOMMENDATION';
  qualities: string[];
  qualitiesNote?: string;
  recommenderFields: RecommenderField[];
  lettersNeeded: number;
}

export interface QuestionnaireProgress {
  answered: number;
  total: number;
  missingRequired: string[];
}

/** `GET /cases/:id/essay` */
export interface EssayQuestionnaireView {
  applicantName: string;
  suggestedLevel: QuestionnaireLevel | null;
  level: QuestionnaireLevel | null;
  definition: QuestionnaireDefinition | null;
  questionnaire: {
    status: QuestionnaireStatus;
    answers: QuestionnaireAnswers;
    submittedAt: string | null;
    reopenNote: string | null;
    reopenedAt: string | null;
    updatedAt: string;
  } | null;
  progress: QuestionnaireProgress | null;
}

export interface RecommendationItem {
  id: string;
  level: QuestionnaireLevel;
  token: string;
  recommenderName: string;
  relation: string | null;
  filledByApplicant: boolean;
  status: RecommendationStatus;
  openedAt: string | null;
  answeredAt: string | null;
  letterReadyAt: string | null;
  receivedAt: string | null;
  staffNote: string | null;
  letterName: string | null;
  hasLetter: boolean;
  progress: QuestionnaireProgress;
  /** Null for the client when the teacher answered through the link. */
  answers: QuestionnaireAnswers | null;
  recommender: QuestionnaireAnswers | null;
}

/** `GET /cases/:id/recommendations` */
export interface RecommendationListView {
  applicantName: string;
  level: QuestionnaireLevel | null;
  definition: RecommendationDefinition | null;
  /** The question set of every level a letter on this case was asked at. */
  definitions: Partial<Record<QuestionnaireLevel, RecommendationDefinition>>;
  lettersNeeded: number | null;
  items: RecommendationItem[];
}

/** `GET /recommend/:token` — what the teacher sees. */
export interface PublicRecommendationView {
  applicantName: string;
  recommenderName: string;
  level: QuestionnaireLevel;
  definition: RecommendationDefinition;
  status: RecommendationStatus;
  locked: boolean;
  answers: QuestionnaireAnswers;
  recommender: QuestionnaireAnswers;
  progress: QuestionnaireProgress;
  answeredAt: string | null;
}
