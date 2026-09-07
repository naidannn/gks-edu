import type { ValidationError } from 'class-validator';

/**
 * Mongolian text for `ValidationPipe`'s replies.
 *
 * `class-validator` writes its own messages in English ("email must be an
 * email"), and `apiErrorMessage()` on the frontend shows whatever the API
 * replied verbatim — so without this every unannotated `@IsString()` puts an
 * English sentence in front of a client. A DTO that carries its own
 * `{ message: '...' }` is already Mongolian and passes through untouched.
 *
 * This is the one place field names are worded for people; nothing else in the
 * API translates a property name.
 */

/** Property name → the wording a person sees. Unlisted fields keep their own name. */
const FIELD_LABELS: Record<string, string> = {
  address: 'Хаяг',
  amountKrw: 'Дүн (₩)',
  answer: 'Хариулт',
  appointmentAt: 'Товлосон цаг',
  birthDate: 'Төрсөн огноо',
  body: 'Агуулга',
  bodyMn: 'Агуулга',
  category: 'Ангилал',
  caseId: 'Үйлчилгээ',
  content: 'Агуулга',
  currentPassword: 'Одоогийн нууц үг',
  decision: 'Шийдвэр',
  description: 'Тайлбар',
  dueAt: 'Дуусах хугацаа',
  education: 'Боловсрол',
  educationLevel: 'Боловсролын түвшин',
  email: 'И-мэйл',
  englishLevel: 'Англи хэлний түвшин',
  firstName: 'Нэр',
  gender: 'Хүйс',
  gpa: 'Голч дүн',
  gpaScale: 'Голч дүнгийн систем',
  guardianFirstName: 'Асран хамгаалагчийн нэр',
  guardianLastName: 'Асран хамгаалагчийн овог',
  guardianPhone: 'Асран хамгаалагчийн утас',
  guardianRegisterNumber: 'Асран хамгаалагчийн регистр',
  guardianRelation: 'Асран хамгаалагчийн хамаарал',
  interestedMajor: 'Сонирхож буй мэргэжил',
  interestedServices: 'Сонирхож буй үйлчилгээ',
  kind: 'Төрөл',
  koreanLevel: 'Солонгос хэлний түвшин',
  lastName: 'Овог',
  level: 'Түвшин',
  month: 'Сар',
  name: 'Нэр',
  nameEn: 'Нэр (англи)',
  nameKo: 'Нэр (солонгос)',
  nameMn: 'Нэр (монгол)',
  newPassword: 'Шинэ нууц үг',
  note: 'Тэмдэглэл',
  paidAt: 'Төлсөн огноо',
  passportExpiry: 'Гадаад паспортын хугацаа',
  passportNumber: 'Гадаад паспортын дугаар',
  password: 'Нууц үг',
  phone: 'Утасны дугаар',
  phoneAlt: 'Нэмэлт утас',
  primaryServiceType: 'Үндсэн үйлчилгээ',
  programId: 'Хөтөлбөр',
  question: 'Асуулт',
  region: 'Бүс нутаг',
  registerNumber: 'Регистрийн дугаар',
  role: 'Эрх',
  scheduledAt: 'Товлосон цаг',
  serviceType: 'Үйлчилгээний төрөл',
  signedAt: 'Гарын үсэг зурсан огноо',
  slug: 'Slug',
  source: 'Эх сурвалж',
  stage: 'Шат',
  status: 'Төлөв',
  subject: 'Гарчиг',
  targetMajor: 'Зорилтот мэргэжил',
  targetUniversityId: 'Зорилтот сургууль',
  title: 'Гарчиг',
  titleMn: 'Гарчиг',
  token: 'Токен',
  topikLevel: 'TOPIK түвшин',
  totalAmount: 'Нийт дүн',
  universityChoices: 'Сонгосон сургуулиуд',
  universityId: 'Сургууль',
  userId: 'Хэрэглэгч',
  year: 'Он',
};

/**
 * Constraint name → Mongolian reason. `limit` is the number the decorator was
 * given, read back out of the English message because `ValidationError` keeps
 * the rendered text and not the arguments that produced it.
 */
const REASONS: Record<string, (limit?: number) => string> = {
  arrayMaxSize: (n) => `хамгийн ихдээ ${n} утга сонгоно уу`,
  arrayMinSize: (n) => `дор хаяж ${n} утга сонгоно уу`,
  arrayNotEmpty: () => 'дор хаяж нэг утга сонгоно уу',
  isArray: () => 'жагсаалт байх ёстой',
  isBoolean: () => 'тийм/үгүй утга байх ёстой',
  isDate: () => 'огноо буруу байна',
  isDateString: () => 'огноог буруу форматаар илгээсэн байна',
  isDefined: () => 'заавал бөглөнө үү',
  isEmail: () => 'и-мэйл хаяг буруу байна',
  isEnum: () => 'сонгосон утга буруу байна',
  isIn: () => 'сонгосон утга буруу байна',
  isInt: () => 'бүхэл тоо байх ёстой',
  isJwt: () => 'токен буруу байна',
  isLength: () => 'урт нь тохирохгүй байна',
  isNotEmpty: () => 'заавал бөглөнө үү',
  isNotEmptyObject: () => 'заавал бөглөнө үү',
  isNumber: () => 'тоо байх ёстой',
  isNumberString: () => 'тоо байх ёстой',
  isObject: () => 'бүтэц буруу байна',
  isPositive: () => 'эерэг тоо байх ёстой',
  isString: () => 'текст байх ёстой',
  isUrl: () => 'холбоос буруу байна',
  isUuid: () => 'дугаар буруу форматтай байна',
  matches: () => 'формат буруу байна',
  max: (n) => `хамгийн ихдээ ${n} байх ёстой`,
  maxLength: (n) => `хамгийн ихдээ ${n} тэмдэгт байх ёстой`,
  min: (n) => `хамгийн багадаа ${n} байх ёстой`,
  minLength: (n) => `хамгийн багадаа ${n} тэмдэгт байх ёстой`,
  whitelistValidation: () => 'ийм талбар байхгүй',
};

const CYRILLIC = /[Ѐ-ӿ]/;

function label(property: string): string {
  return FIELD_LABELS[property] ?? property;
}

/** The `$constraint1` the decorator was given, as rendered into the English text. */
function limitFrom(rendered: string): number | undefined {
  const numbers = rendered.match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : undefined;
}

function translate(property: string, constraint: string, rendered: string): string {
  // A DTO that worded its own message meant it; only the defaults are ours to
  // rewrite, and they are the ones with no Cyrillic in them.
  if (CYRILLIC.test(rendered)) return rendered;

  const reason = REASONS[constraint]?.(limitFrom(rendered)) ?? 'утга буруу байна';
  return `${label(property)}: ${reason}`;
}

/**
 * Flattens the pipe's errors — nested DTOs included, as
 * `Сонгосон сургуулиуд › 2 › Сургууль` — into the string array the frontend
 * joins with commas.
 */
export function mongolianValidationMessages(
  errors: ValidationError[],
  parents: string[] = [],
): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    // An array index is the property name here; it reads as a position, not a field.
    const path = /^\d+$/.test(error.property)
      ? [...parents, String(Number(error.property) + 1)]
      : [...parents, label(error.property)];

    for (const [constraint, rendered] of Object.entries(error.constraints ?? {})) {
      const translated = translate(error.property, constraint, rendered);
      messages.push(
        parents.length ? `${path.slice(0, -1).join(' › ')} › ${translated}` : translated,
      );
    }

    if (error.children?.length) {
      messages.push(...mongolianValidationMessages(error.children, path));
    }
  }

  return messages;
}
