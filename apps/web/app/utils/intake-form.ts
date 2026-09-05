import type { AdminIntakeTerm, IntakeCandidate, IntakeStatus, ProgramLevel } from '@gks/shared';

/**
 * The intake form's shape, validation and payload (1H-05), shared by the
 * manual and the LLM-assisted paths so a researched round and a typed one are
 * saved through exactly the same code.
 *
 * Every field is a string, the empty one meaning "unknown". An empty date is
 * stored as `null` and rendered as "мэдээлэл шинэчлэгдэж байна" — never as a
 * date somebody guessed (CLAUDE.md).
 */

export interface IntakeForm {
  universityId: string;
  level: ProgramLevel | '';
  year: string;
  month: string;
  openAt: string;
  applicationDeadline: string;
  /**
   * Left blank, the API derives it as `applicationDeadline` minus the
   * configured lead time. Typed in, it is frozen against future recomputes —
   * so this box is empty unless a human meant something by it.
   */
  internalDeadline: string;
  classStartDate: string;
  resultAnnouncedAt: string;
  quota: string;
  admissionFeeKrw: string;
  requirementNote: string;
  status: IntakeStatus;
  note: string;
  sourceUrl: string;
  verified: boolean;
}

export function emptyIntakeForm(universityId = ''): IntakeForm {
  return {
    universityId,
    level: '',
    year: String(new Date().getFullYear() + 1),
    month: '3',
    openAt: '',
    applicationDeadline: '',
    internalDeadline: '',
    classStartDate: '',
    resultAnnouncedAt: '',
    quota: '',
    admissionFeeKrw: '',
    requirementNote: '',
    status: 'PLANNED',
    note: '',
    sourceUrl: '',
    verified: false,
  };
}

/** `2027-01-31T15:00:00.000Z` → `2027-01-31`, which is what `<input type=date>` wants. */
export function toDateInput(value: string | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

export function fillIntakeForm(form: IntakeForm, intake: AdminIntakeTerm): void {
  form.universityId = intake.universityId;
  form.level = intake.level;
  form.year = String(intake.year);
  form.month = String(intake.month);
  form.openAt = toDateInput(intake.openAt);
  form.applicationDeadline = toDateInput(intake.applicationDeadline);
  // Only a manually pinned deadline goes back in the box: showing the derived
  // one would turn it manual the moment the form is saved again.
  form.internalDeadline = intake.internalDeadlineIsManual ? toDateInput(intake.internalDeadline) : '';
  form.classStartDate = toDateInput(intake.classStartDate);
  form.resultAnnouncedAt = toDateInput(intake.resultAnnouncedAt);
  form.quota = intake.quota === null ? '' : String(intake.quota);
  form.admissionFeeKrw = intake.admissionFeeKrw === null ? '' : String(intake.admissionFeeKrw);
  form.requirementNote = intake.requirementNote ?? '';
  form.status = intake.status;
  form.note = intake.note ?? '';
  form.sourceUrl = intake.sourceUrl ?? '';
  form.verified = Boolean(intake.verifiedAt);
}

/** Drops a Gemini candidate into the form. It fills boxes; it never saves. */
export function fillIntakeFormFromCandidate(form: IntakeForm, candidate: IntakeCandidate): void {
  form.level = candidate.level;
  form.year = String(candidate.year);
  form.month = String(candidate.month);
  form.openAt = candidate.openAt ?? '';
  form.applicationDeadline = candidate.applicationDeadline ?? '';
  // Left blank on purpose: our deadline is derived from the school's, and a
  // researched round has no human-pinned date behind it.
  form.internalDeadline = '';
  form.classStartDate = candidate.classStartDate ?? '';
  form.resultAnnouncedAt = candidate.resultAnnouncedAt ?? '';
  form.quota = candidate.quota === null ? '' : String(candidate.quota);
  form.admissionFeeKrw = candidate.admissionFeeKrw === null ? '' : String(candidate.admissionFeeKrw);
  form.requirementNote = candidate.requirementNote ?? '';
  form.sourceUrl = candidate.sourceUrl ?? '';
  // A researched round is unverified by definition — a human has not checked
  // it against the school yet, and the list flags that.
  form.verified = false;
  form.note = candidate.note ?? '';
}

const text = (value: string): string | null => (value.trim() ? value.trim() : null);
const int = (value: string): number | null => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The API payload. `internalDeadline` is sent as `null` when the box is empty,
 * which is how a row is handed back to the automatic rule after somebody had
 * pinned it.
 */
export function intakePayload(form: IntakeForm, options: { includeUniversity: boolean }) {
  return {
    ...(options.includeUniversity ? { universityId: form.universityId } : {}),
    level: form.level,
    year: int(form.year),
    month: int(form.month),
    openAt: text(form.openAt),
    applicationDeadline: text(form.applicationDeadline),
    internalDeadline: text(form.internalDeadline),
    classStartDate: text(form.classStartDate),
    resultAnnouncedAt: text(form.resultAnnouncedAt),
    quota: form.quota.trim() ? int(form.quota) : null,
    admissionFeeKrw: form.admissionFeeKrw.trim() ? int(form.admissionFeeKrw) : null,
    requirementNote: text(form.requirementNote),
    status: form.status,
    note: text(form.note),
    sourceUrl: text(form.sourceUrl),
    verified: form.verified,
  };
}

export type IntakeFormErrors = Partial<Record<keyof IntakeForm, string>>;

export function validateIntakeForm(form: IntakeForm): IntakeFormErrors {
  const errors: IntakeFormErrors = {};

  if (!form.universityId) errors.universityId = 'Сургууль сонгоно уу';
  if (!form.level) errors.level = 'Түвшин сонгоно уу';

  const year = int(form.year);
  if (year === null || year < 2020 || year > 2100) errors.year = 'Жилээ зөв оруулна уу';
  if (!['3', '6', '9', '12'].includes(form.month)) errors.month = 'Элсэлтийн сар 3, 6, 9 эсвэл 12 байна';

  // Dates that contradict each other are the ones that quietly break a case.
  const open = form.openAt ? Date.parse(form.openAt) : null;
  const deadline = form.applicationDeadline ? Date.parse(form.applicationDeadline) : null;
  const internal = form.internalDeadline ? Date.parse(form.internalDeadline) : null;
  const classStart = form.classStartDate ? Date.parse(form.classStartDate) : null;

  if (open !== null && deadline !== null && open > deadline) {
    errors.openAt = 'Бүртгэл эхлэх огноо эцсийн хугацаанаас хойш байж болохгүй';
  }
  if (internal !== null && deadline !== null && internal > deadline) {
    errors.internalDeadline = 'Манай хугацаа сургуулийн хугацаанаас хойш байж болохгүй';
  }
  if (deadline !== null && classStart !== null && deadline > classStart) {
    errors.classStartDate = 'Хичээл эхлэх огноо материалын эцсийн хугацаанаас өмнө байж болохгүй';
  }

  if (form.sourceUrl.trim() && !/^https?:\/\//i.test(form.sourceUrl.trim())) {
    errors.sourceUrl = 'Холбоос http:// эсвэл https:// -ээр эхэлнэ';
  }

  return errors;
}
