import type { ClientDetail, EducationLevel, Gender, LeadDetail, LeadSource, ServiceType } from '@gks/shared';
import { ADULT_AGE, REGISTER_PATTERN, ageOn } from '@gks/shared';

/**
 * The client form's shape, validation and payload, shared by the create and
 * edit screens (1B-14) so the two can never drift apart on what a contract needs.
 */

const PHONE_PATTERN = /^(976)?\d{8}$/;

export interface ClientForm {
  lastName: string;
  firstName: string;
  birthDate: string;
  registerNumber: string;
  gender: Gender | '';
  phone: string;
  phoneAlt: string;
  email: string;
  address: string;

  guardianLastName: string;
  guardianFirstName: string;
  guardianRegisterNumber: string;
  guardianPhone: string;
  guardianRelation: string;

  educationLevel: EducationLevel | '';
  schoolName: string;
  gpa: string;
  gpaScale: string;
  koreanLevel: string;
  englishLevel: string;
  passportNumber: string;
  passportExpiry: string;

  primaryServiceType: ServiceType | '';
  targetUniversityId: string;
  targetMajor: string;
  source: LeadSource;
  note: string;
}

export function emptyClientForm(): ClientForm {
  return {
    lastName: '', firstName: '', birthDate: '', registerNumber: '', gender: '',
    phone: '', phoneAlt: '', email: '', address: '',
    guardianLastName: '', guardianFirstName: '', guardianRegisterNumber: '', guardianPhone: '', guardianRelation: '',
    educationLevel: '', schoolName: '', gpa: '', gpaScale: '', koreanLevel: '', englishLevel: '',
    passportNumber: '', passportExpiry: '',
    primaryServiceType: '', targetUniversityId: '', targetMajor: '', source: 'OFFICE', note: '',
  };
}

/** Copies across everything a lead already knows, ready for staff to complete. */
export function fillFromLead(form: ClientForm, lead: LeadDetail): void {
  form.lastName = lead.lastName;
  form.firstName = lead.firstName;
  form.phone = lead.phone;
  form.email = lead.email ?? '';
  form.educationLevel = lead.educationLevel ?? '';
  form.gpa = lead.gpa === null ? '' : String(lead.gpa);
  form.gpaScale = lead.gpaScale ?? '';
  form.koreanLevel = lead.koreanLevel ?? '';
  form.englishLevel = lead.englishLevel ?? '';
  form.targetMajor = lead.interestedMajor ?? '';
  form.primaryServiceType = lead.interestedServices[0] ?? '';
  form.targetUniversityId = lead.interestedUniversityIds[0] ?? '';
  form.source = lead.source;
}

export function fillFromClient(form: ClientForm, client: ClientDetail): void {
  const iso = (value: string | null) => (value ? value.slice(0, 10) : '');
  form.lastName = client.lastName;
  form.firstName = client.firstName;
  form.birthDate = iso(client.birthDate);
  form.registerNumber = client.registerNumber;
  form.gender = client.gender ?? '';
  form.phone = client.phone;
  form.phoneAlt = client.phoneAlt ?? '';
  form.email = client.email ?? '';
  form.address = client.address ?? '';
  form.guardianLastName = client.guardianLastName ?? '';
  form.guardianFirstName = client.guardianFirstName ?? '';
  form.guardianRegisterNumber = client.guardianRegisterNumber ?? '';
  form.guardianPhone = client.guardianPhone ?? '';
  form.guardianRelation = client.guardianRelation ?? '';
  form.educationLevel = client.educationLevel ?? '';
  form.schoolName = client.schoolName ?? '';
  form.gpa = client.gpa === null ? '' : String(client.gpa);
  form.gpaScale = client.gpaScale ?? '';
  form.koreanLevel = client.koreanLevel ?? '';
  form.englishLevel = client.englishLevel ?? '';
  form.passportNumber = client.passportNumber ?? '';
  form.passportExpiry = iso(client.passportExpiry);
  form.primaryServiceType = client.primaryServiceType;
  form.targetUniversityId = client.targetUniversityId ?? '';
  form.targetMajor = client.targetMajor ?? '';
  form.source = client.source;
  form.note = client.note ?? '';
}

export function clientAge(form: ClientForm): number | null {
  return form.birthDate ? ageOn(form.birthDate) : null;
}

/** A client below 18 signs through a guardian, so that block becomes required (§6.2). */
export function isMinorForm(form: ClientForm): boolean {
  const age = clientAge(form);
  return age !== null && age < ADULT_AGE;
}

/** Fills `errors` in place and reports whether the form may be submitted. */
export function validateClientForm(form: ClientForm, errors: Record<string, string>): boolean {
  for (const key of Object.keys(errors)) Reflect.deleteProperty(errors, key);

  if (form.lastName.trim().length < 2) errors.lastName = 'Овгоо бөглөнө үү';
  if (form.firstName.trim().length < 2) errors.firstName = 'Нэрээ бөглөнө үү';

  const age = clientAge(form);
  if (!form.birthDate) errors.birthDate = 'Төрсөн огноог сонгоно уу';
  else if (age !== null && (age < 10 || age > 80)) errors.birthDate = 'Төрсөн огноо буруу байна';

  if (!REGISTER_PATTERN.test(form.registerNumber.toUpperCase())) {
    errors.registerNumber = 'Регистрийн дугаар буруу байна (жишээ: УБ12345678)';
  }
  if (!PHONE_PATTERN.test(stripPhone(form.phone))) errors.phone = 'Утасны дугаар буруу байна';
  if (form.phoneAlt && !PHONE_PATTERN.test(stripPhone(form.phoneAlt))) errors.phoneAlt = 'Утасны дугаар буруу байна';
  if (!form.primaryServiceType) errors.primaryServiceType = 'Үйлчилгээний төрлийг сонгоно уу';

  if (isMinorForm(form)) {
    if (form.guardianLastName.trim().length < 2) errors.guardianLastName = 'Төлөөлөгчийн овгийг бөглөнө үү';
    if (form.guardianFirstName.trim().length < 2) errors.guardianFirstName = 'Төлөөлөгчийн нэрийг бөглөнө үү';
    if (!REGISTER_PATTERN.test(form.guardianRegisterNumber.toUpperCase())) {
      errors.guardianRegisterNumber = 'Төлөөлөгчийн регистрийн дугаар буруу байна';
    }
  }

  return Object.keys(errors).length === 0;
}

function stripPhone(value: string): string {
  return value.replace(/[\s()+-]/g, '');
}

/**
 * Empty strings become `undefined` rather than `''` — the API's validators
 * reject an empty email or a blank register number, and an untouched optional
 * field should simply not be sent.
 */
export function clientPayload(form: ClientForm): Record<string, unknown> {
  const text = (value: string) => (value.trim() ? value.trim() : undefined);
  const minor = isMinorForm(form);

  return {
    lastName: form.lastName.trim(),
    firstName: form.firstName.trim(),
    birthDate: form.birthDate,
    registerNumber: form.registerNumber.toUpperCase(),
    gender: form.gender || undefined,
    phone: stripPhone(form.phone),
    phoneAlt: form.phoneAlt ? stripPhone(form.phoneAlt) : undefined,
    email: text(form.email),
    address: text(form.address),

    // Guardian details are only meaningful while the client is a minor; for an
    // adult they are left out so a stale block cannot creep into a contract.
    guardianLastName: minor ? form.guardianLastName.trim() : undefined,
    guardianFirstName: minor ? form.guardianFirstName.trim() : undefined,
    guardianRegisterNumber: minor ? form.guardianRegisterNumber.toUpperCase() : undefined,
    guardianPhone: minor && form.guardianPhone ? stripPhone(form.guardianPhone) : undefined,
    guardianRelation: minor ? text(form.guardianRelation) : undefined,

    educationLevel: form.educationLevel || undefined,
    schoolName: text(form.schoolName),
    gpa: form.gpa ? Number(form.gpa) : undefined,
    gpaScale: text(form.gpaScale),
    koreanLevel: text(form.koreanLevel),
    englishLevel: text(form.englishLevel),
    passportNumber: text(form.passportNumber),
    passportExpiry: form.passportExpiry || undefined,

    primaryServiceType: form.primaryServiceType,
    targetUniversityId: form.targetUniversityId || undefined,
    targetMajor: text(form.targetMajor),
    source: form.source,
    note: text(form.note),
  };
}

/**
 * The same payload minus everything the office owns (1B-18). `PUT /me/profile`
 * runs under `forbidNonWhitelisted`, so a stray `source` or `note` would be a
 * 400 rather than a silently ignored field.
 */
export function myProfilePayload(form: ClientForm): Record<string, unknown> {
  const payload = clientPayload(form);
  delete payload.source;
  delete payload.note;
  return payload;
}

/** The portal also needs the address the contract prints (§6.2). */
export function validateMyProfileForm(form: ClientForm, errors: Record<string, string>): boolean {
  const valid = validateClientForm(form, errors);
  if (!form.address.trim()) errors.address = 'Гэрийн хаягаа бөглөнө үү — гэрээнд бичигдэнэ';
  return valid && Object.keys(errors).length === 0;
}
