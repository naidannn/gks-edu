import type { QuestionnaireLevel } from './definitions/index.js';

/**
 * Which level's questions a GKS case most likely needs, before anyone has said.
 *
 * The chosen programme knows for certain; failing that, the applicant's current
 * education says what comes next (a school-leaver applies for a bachelor's, a
 * graduate for a master's). Null means "ask" — the portal then shows the three
 * levels and the client picks, rather than us guessing into the wrong form.
 */
export function suggestQuestionnaireLevel(input: {
  programLevel?: string | null;
  intakeLevel?: string | null;
  educationLevel?: string | null;
}): QuestionnaireLevel | null {
  for (const level of [input.programLevel, input.intakeLevel]) {
    if (level === 'BACHELOR' || level === 'MASTER' || level === 'PHD') return level;
  }
  switch (input.educationLevel) {
    case 'SECONDARY_SCHOOL':
    case 'VOCATIONAL':
      return 'BACHELOR';
    case 'BACHELOR':
      return 'MASTER';
    case 'MASTER':
    case 'PHD':
      return 'PHD';
    default:
      return null;
  }
}
