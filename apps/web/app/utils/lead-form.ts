import type { EducationLevel, LeadDetail, LeadSource, LeadStage, ServiceType } from '@gks/shared';

/**
 * The consultation form's shape, validation and payload (1B-19), shared by the
 * registration screen and the detail page's edit mode so the office is asked
 * for the same things whether it is writing the record or correcting it.
 *
 * Only name and phone are required: a consultant types this while talking to
 * someone, and a half-known record beats no record at all. Everything else is
 * what the sale will want later.
 */

const PHONE_PATTERN = /^(976)?\d{8}$/;

export interface LeadForm {
  lastName: string;
  firstName: string;
  phone: string;
  email: string;
  age: string;

  educationLevel: EducationLevel | '';
  schoolName: string;
  gpa: string;
  gpaScale: string;
  koreanLevel: string;
  englishLevel: string;

  interestedServices: ServiceType[];
  interestedUniversityIds: string[];
  interestedMajor: string;

  source: LeadSource;
  stage: LeadStage;
  assignedToId: string;
  nextContactAt: string;
  winProbability: string;
  note: string;
}

export function emptyLeadForm(): LeadForm {
  return {
    lastName: '', firstName: '', phone: '', email: '', age: '',
    educationLevel: '', schoolName: '', gpa: '', gpaScale: '', koreanLevel: '', englishLevel: '',
    interestedServices: [], interestedUniversityIds: [], interestedMajor: '',
    // Someone standing at the desk arrived at the office and has, by the time
    // this is typed, already been advised.
    source: 'OFFICE', stage: 'CONSULTED',
    assignedToId: '', nextContactAt: '', winProbability: '', note: '',
  };
}

/** Seeds the form from a saved record, for the detail page's edit mode. */
export function fillLeadForm(form: LeadForm, lead: LeadDetail): void {
  form.lastName = lead.lastName;
  form.firstName = lead.firstName;
  form.phone = lead.phone;
  form.email = lead.email ?? '';
  form.age = lead.age === null ? '' : String(lead.age);
  form.educationLevel = lead.educationLevel ?? '';
  form.schoolName = lead.schoolName ?? '';
  form.gpa = lead.gpa === null ? '' : String(lead.gpa);
  form.gpaScale = lead.gpaScale ?? '';
  form.koreanLevel = lead.koreanLevel ?? '';
  form.englishLevel = lead.englishLevel ?? '';
  form.interestedServices = [...lead.interestedServices];
  form.interestedUniversityIds = [...lead.interestedUniversityIds];
  form.interestedMajor = lead.interestedMajor ?? '';
  form.source = lead.source;
  form.stage = lead.stage;
  form.assignedToId = lead.assignedToId ?? '';
  form.nextContactAt = lead.nextContactAt ? lead.nextContactAt.slice(0, 10) : '';
  form.winProbability = lead.winProbability === null ? '' : String(lead.winProbability);
  form.note = lead.note ?? '';
}

/** Fills `errors` in place and reports whether the form may be submitted. */
export function validateLeadForm(form: LeadForm, errors: Record<string, string>): boolean {
  for (const key of Object.keys(errors)) Reflect.deleteProperty(errors, key);

  if (form.lastName.trim().length < 2) errors.lastName = 'Овгийг бөглөнө үү';
  if (form.firstName.trim().length < 2) errors.firstName = 'Нэрийг бөглөнө үү';
  if (!PHONE_PATTERN.test(stripPhone(form.phone))) errors.phone = 'Утасны дугаар буруу байна';
  if (form.email.trim() && !form.email.includes('@')) errors.email = 'И-мэйл хаяг буруу байна';

  const age = Number(form.age);
  if (form.age && (!Number.isInteger(age) || age < 14 || age > 70)) errors.age = 'Нас 14–70 хооронд байна';

  const gpa = Number(form.gpa);
  if (form.gpa && (!Number.isFinite(gpa) || gpa < 0 || gpa > 100)) errors.gpa = 'Голч дүн 0–100 хооронд байна';

  const probability = Number(form.winProbability);
  if (form.winProbability && (!Number.isInteger(probability) || probability < 0 || probability > 100)) {
    errors.winProbability = 'Магадлал 0–100 хооронд байна';
  }

  return Object.keys(errors).length === 0;
}

export function stripPhone(value: string): string {
  return value.replace(/[\s()+-]/g, '');
}

/**
 * The eight digits the API actually stores (its `normalizePhone`). Only search
 * needs this: what is *sent* keeps whatever the consultant typed, because the
 * API is the single authority on the stored form.
 */
export function normalizedPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('976') && digits.length > 8 ? digits.slice(3) : digits;
}

/**
 * Empty strings become `undefined`, not `''` — the API rejects a blank email
 * outright, and an untouched optional field should simply not be sent.
 */
export function leadPayload(form: LeadForm): Record<string, unknown> {
  const text = (value: string) => (value.trim() ? value.trim() : undefined);

  return {
    lastName: form.lastName.trim(),
    firstName: form.firstName.trim(),
    phone: stripPhone(form.phone),
    email: text(form.email),
    age: form.age ? Number(form.age) : undefined,

    educationLevel: form.educationLevel || undefined,
    schoolName: text(form.schoolName),
    gpa: form.gpa ? Number(form.gpa) : undefined,
    gpaScale: text(form.gpaScale),
    koreanLevel: text(form.koreanLevel),
    englishLevel: text(form.englishLevel),

    interestedServices: form.interestedServices,
    interestedUniversityIds: form.interestedUniversityIds,
    interestedMajor: text(form.interestedMajor),

    source: form.source,
    stage: form.stage,
    assignedToId: form.assignedToId || undefined,
    // The picker gives a date; the column is a timestamp.
    nextContactAt: form.nextContactAt ? new Date(form.nextContactAt).toISOString() : undefined,
    winProbability: form.winProbability ? Number(form.winProbability) : undefined,
    note: text(form.note),
  };
}

/**
 * The subset `PATCH /leads/:id` accepts. Stage, source and assignee each have
 * their own endpoint, and sending them here would silently bypass the funnel
 * rules (1B-02) and the assignment log (1B-04).
 */
export function leadUpdatePayload(form: LeadForm): Record<string, unknown> {
  const { source: _source, stage: _stage, assignedToId: _assignedToId, ...rest } = leadPayload(form);
  return rest;
}
