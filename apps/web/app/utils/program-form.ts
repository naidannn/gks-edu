import type { AdminProgram, InstructionLanguage, ProgramCandidate, ProgramLevel } from '@gks/shared';

/**
 * The programme form's shape, validation and payload, shared by the manual and
 * the LLM-assisted paths so a researched programme and a typed one are saved
 * through exactly the same code.
 *
 * Every field is a string, the empty one meaning "unknown". An empty price is
 * stored as `null` and rendered as "мэдээлэл шинэчлэгдэж байна" — never as a
 * zero somebody would read as free (CLAUDE.md).
 */

export interface ProgramForm {
  universityId: string;
  level: ProgramLevel | '';
  nameMn: string;
  nameEn: string;
  nameKo: string;
  /** An existing college of this school, or empty for "none". */
  facultyId: string;
  /**
   * A college by *name* — what a research candidate carries and what somebody
   * can type for a college the school has not got a row for yet. The API
   * creates it. `facultyId` wins when both are set.
   */
  facultyName: string;
  durationYears: string;
  tuitionPerTermKrw: string;
  tuitionPerYearKrw: string;
  admissionFeeKrw: string;
  tuitionYear: string;
  scholarshipMaxPercent: string;
  scholarshipNote: string;
  topikLevel: string;
  ieltsScore: string;
  otherRequirements: string;
  language: InstructionLanguage;
  acceptsInternational: boolean;
  sourceUrl: string;
  internalNote: string;
  isPublished: boolean;
  verified: boolean;
}

export type ProgramFormErrors = Partial<Record<keyof ProgramForm, string>>;

export function emptyProgramForm(universityId = ''): ProgramForm {
  return {
    universityId,
    level: '',
    nameMn: '',
    nameEn: '',
    nameKo: '',
    facultyId: '',
    facultyName: '',
    durationYears: '',
    tuitionPerTermKrw: '',
    tuitionPerYearKrw: '',
    admissionFeeKrw: '',
    // The current academic year is the useful default: a price is being typed
    // off a page the person is looking at right now.
    tuitionYear: String(new Date().getFullYear()),
    scholarshipMaxPercent: '',
    scholarshipNote: '',
    topikLevel: '',
    ieltsScore: '',
    otherRequirements: '',
    language: 'KOREAN',
    acceptsInternational: true,
    sourceUrl: '',
    internalNote: '',
    isPublished: true,
    verified: false,
  };
}

export function fillProgramForm(form: ProgramForm, program: AdminProgram): void {
  form.universityId = program.universityId;
  form.level = program.level;
  form.nameMn = program.nameMn;
  form.nameEn = program.nameEn ?? '';
  form.nameKo = program.nameKo ?? '';
  form.facultyId = program.facultyId ?? '';
  form.facultyName = '';
  form.durationYears = numberInput(program.durationYears);
  form.tuitionPerTermKrw = numberInput(program.tuitionPerTermKrw);
  form.tuitionPerYearKrw = numberInput(program.tuitionPerYearKrw);
  form.admissionFeeKrw = numberInput(program.admissionFeeKrw);
  form.tuitionYear = numberInput(program.tuitionYear);
  form.scholarshipMaxPercent = numberInput(program.scholarshipMaxPercent);
  form.scholarshipNote = program.scholarshipNote ?? '';
  form.topikLevel = numberInput(program.topikLevel);
  form.ieltsScore = numberInput(program.ieltsScore);
  form.otherRequirements = program.otherRequirements ?? '';
  form.language = program.language;
  form.acceptsInternational = program.acceptsInternational;
  form.sourceUrl = program.sourceUrl ?? '';
  form.internalNote = program.internalNote ?? '';
  form.isPublished = program.isPublished;
  form.verified = program.verifiedAt !== null;
}

/**
 * Drops one research candidate into the form — and only into the form. Nothing
 * is saved until a human presses the button.
 *
 * The Mongolian name is the one field research cannot supply: the model writes
 * Korean and English, and what a client is shown is ours to word. It is
 * pre-filled from the English name so the box is never empty, and it is the
 * first thing the reviewer sees.
 */
export function fillProgramFormFromCandidate(form: ProgramForm, candidate: ProgramCandidate): void {
  form.level = candidate.level;
  form.nameKo = candidate.nameKo ?? '';
  form.nameEn = candidate.nameEn ?? '';
  form.nameMn = candidate.nameEn ?? candidate.nameKo ?? '';
  // A candidate carries a college *name* off a prospectus, never an id: the
  // API resolves it, creating the row if this is the first department we have
  // seen from that college.
  form.facultyId = '';
  form.facultyName = candidate.faculty ?? '';
  form.durationYears = numberInput(candidate.durationYears);
  form.tuitionPerTermKrw = numberInput(candidate.tuitionPerTermKrw);
  form.tuitionPerYearKrw = numberInput(candidate.tuitionPerYearKrw);
  form.admissionFeeKrw = numberInput(candidate.admissionFeeKrw);
  form.tuitionYear = numberInput(candidate.tuitionYear);
  form.scholarshipMaxPercent = numberInput(candidate.scholarshipMaxPercent);
  form.scholarshipNote = candidate.scholarshipNote ?? '';
  form.topikLevel = numberInput(candidate.topikLevel);
  form.language = candidate.language;
  form.sourceUrl = candidate.sourceUrl ?? '';
  // A researched row is only ever "checked" once a human has actually checked it.
  form.verified = false;
}

export function validateProgramForm(form: ProgramForm): ProgramFormErrors {
  const errors: ProgramFormErrors = {};

  if (!form.universityId) errors.universityId = 'Сургууль сонгоно уу.';
  if (!form.level) errors.level = 'Түвшин сонгоно уу.';
  if (form.nameMn.trim().length < 2) errors.nameMn = 'Монгол нэрийг бөглөнө үү.';

  const term = Number(form.tuitionPerTermKrw);
  const year = Number(form.tuitionPerYearKrw);
  if (form.tuitionPerTermKrw && form.tuitionPerYearKrw && year < term) {
    // Almost always the per-semester figure typed into the annual box.
    errors.tuitionPerYearKrw = 'Жилийн төлбөр нэг улирлынхаас бага байж болохгүй.';
  }
  if ((form.tuitionPerTermKrw || form.tuitionPerYearKrw) && !form.tuitionYear) {
    errors.tuitionYear = 'Ямар оны үнэ болохыг заавал бичнэ үү.';
  }
  if (form.sourceUrl && !/^https?:\/\//i.test(form.sourceUrl.trim())) {
    errors.sourceUrl = 'Холбоос http эсвэл https-ээр эхлэх ёстой.';
  }

  return errors;
}

/** The request body. Empty boxes are sent as `null`, which clears the column. */
export function programPayload(form: ProgramForm, options: { includeUniversity: boolean }) {
  return {
    ...(options.includeUniversity ? { universityId: form.universityId } : {}),
    level: form.level,
    nameMn: form.nameMn.trim(),
    nameEn: text(form.nameEn),
    nameKo: text(form.nameKo),
    // An explicit null is meaningful — "this department has no college" — so
    // the id is always sent. The typed name only goes when no id was chosen.
    facultyId: form.facultyId || null,
    ...(form.facultyId ? {} : { facultyName: text(form.facultyName) }),
    durationYears: number(form.durationYears),
    tuitionPerTermKrw: number(form.tuitionPerTermKrw),
    tuitionPerYearKrw: number(form.tuitionPerYearKrw),
    admissionFeeKrw: number(form.admissionFeeKrw),
    tuitionYear: number(form.tuitionYear),
    scholarshipMaxPercent: number(form.scholarshipMaxPercent),
    scholarshipNote: text(form.scholarshipNote),
    topikLevel: number(form.topikLevel),
    ieltsScore: number(form.ieltsScore),
    otherRequirements: text(form.otherRequirements),
    language: form.language,
    acceptsInternational: form.acceptsInternational,
    sourceUrl: text(form.sourceUrl),
    internalNote: text(form.internalNote),
    isPublished: form.isPublished,
    verified: form.verified,
  };
}

/**
 * One research candidate as a `bulk` entry — the shape saved when a reviewer
 * ticks several at once instead of opening each in the form.
 */
export function candidateToBulkEntry(candidate: ProgramCandidate) {
  return {
    level: candidate.level,
    // The school's own English name is the closest thing to a Mongolian one we
    // have without asking; staff rename it on the list afterwards.
    nameMn: (candidate.nameEn ?? candidate.nameKo ?? '').slice(0, 200),
    nameEn: candidate.nameEn,
    nameKo: candidate.nameKo,
    facultyName: candidate.faculty,
    durationYears: candidate.durationYears,
    tuitionPerTermKrw: candidate.tuitionPerTermKrw,
    tuitionPerYearKrw: candidate.tuitionPerYearKrw,
    admissionFeeKrw: candidate.admissionFeeKrw,
    tuitionYear: candidate.tuitionYear,
    scholarshipMaxPercent: candidate.scholarshipMaxPercent,
    scholarshipNote: candidate.scholarshipNote,
    topikLevel: candidate.topikLevel,
    language: candidate.language,
    sourceUrl: candidate.sourceUrl,
    sourceType: 'AI_ASSISTED' as const,
    // Saved from a research run is not the same as checked against the school.
    verified: false,
  };
}

function numberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function text(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function number(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
