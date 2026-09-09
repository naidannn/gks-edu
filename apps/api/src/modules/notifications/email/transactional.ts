import type { EmailMessage } from './email-template.js';

/**
 * The mails that are not notifications.
 *
 * A notification is something an admin may reword and a recipient may switch
 * off; these seven carry a credential or a promise, so their copy lives in code
 * and they are sent directly rather than through the dispatcher. Keeping them
 * here — as pure functions from data to message — also means the preview
 * script renders exactly what production sends, instead of a copy that drifts.
 */

const PHONE = '7710-9000';

function greeting(name?: string | null): string {
  return `Сайн байна уу${name ? `, ${name}` : ''}.`;
}

/**
 * Every credential mail ends the same way: if the link is dead, a human fixes
 * it. Naming the consultant when we know them turns "холбогдоно уу" from a
 * brush-off into an address.
 */
function contactLine(consultantName: string | null | undefined, lead: string): string {
  const who = consultantName ? `хариуцсан зөвлөх ${consultantName}` : 'хариуцсан зөвлөхтэйгээ';
  return `${lead} ${who} эсвэл ${PHONE} дугаараар холбогдоно уу — шинэ холбоос илгээж өгнө.`;
}

/**
 * 1B-19 — the first mail a staff-registered client ever gets.
 *
 * It is deliberately one mail rather than two: a "тавтай морил" that says an
 * account exists, and a separate invitation to activate it, would arrive
 * together and compete. So the welcome carries the link — the only way into
 * the cabinet for a row that has no password.
 */
export function clientWelcomeEmail(input: {
  name?: string | null;
  email: string;
  link: string;
  /** Whoever the client should ring when the link has died. */
  consultantName?: string | null;
}): EmailMessage {
  return {
    subject: 'GKSedu.mn — тавтай морил, бүртгэлээ идэвхжүүлнэ үү',
    eyebrow: 'Тавтай морил',
    tone: 'success',
    heading: 'Кабинет тань бэлэн боллоо',
    preheader: 'Нууц үгээ тохируулаад үйлчилгээнийхээ явцыг онлайнаар хөтлөөрэй.',
    body: [
      greeting(input.name),
      '',
      'GKS EDU GROUP таны нэр дээр үйлчилгээний бүртгэл нээлээ. Доорх товчоор нууц үгээ ' +
        'тохируулснаар gksedu.mn дээрх хувийн кабинет тань нээгдэнэ.',
      '',
      'Кабинетаараа юу хийх вэ:',
      '- Бүрдүүлэх материалынхаа жагсаалтыг харж, онлайнаар илгээх',
      '- Мэдүүлэг, урилга, визний явцаа алхам алхмаар хөтлөх',
      '- Төлбөрөө QPay-ээр төлж, төлбөрийн түүхээ харах',
      '- Хариуцсан зөвлөхтэйгээ шууд бичиж харилцах',
      '',
      `Нэвтрэх имэйл: ${input.email}`,
      'Холбоос хүчинтэй: 7 хоног',
      '',
      'Хэрэв энэ хаяг тань Google бүртгэлтэй бол нууц үг тохируулахгүйгээр «Google-ээр ' +
        'нэвтрэх» товчийг ашиглаж бас орж болно.',
      '',
      contactLine(input.consultantName, 'Холбоос хүчингүй болсон эсвэл асуух зүйл гарвал'),
    ].join('\n'),
    cta: { label: 'Нууц үгээ тохируулах', url: input.link },
    footerNote: 'Энэ захидал танд хамаагүй бол үл тоомсорлоно уу — холбоос 7 хоногийн дараа хүчингүй болно.',
  };
}

/**
 * 1B-17 — staff created the account; the client sets the password. Also the
 * mail a consultant re-sends after the first link has expired (1B-19).
 */
export function accountClaimEmail(input: {
  name?: string | null;
  email: string;
  link: string;
  consultantName?: string | null;
}): EmailMessage {
  return {
    subject: 'GKSedu.mn — бүртгэлээ идэвхжүүлнэ үү',
    eyebrow: 'Урилга',
    tone: 'success',
    heading: 'Бүртгэлээ идэвхжүүлнэ үү',
    body: [
      greeting(input.name),
      '',
      'GKS EDU GROUP таны нэр дээр үйлчилгээний бүртгэл үүсгэлээ. Доорх товчоор орж ' +
        'нууц үгээ тохируулснаар кабинет тань нээгдэнэ.',
      '',
      'Кабинетаараа материалаа онлайнаар илгээх, хянагдаж буй явцаа хөтлөх, төлбөрөө ' +
        'QPay-ээр төлөх боломжтой.',
      '',
      `Бүртгэлийн имэйл: ${input.email}`,
      'Холбоос хүчинтэй: 7 хоног',
      '',
      contactLine(input.consultantName, 'Холбоос хүчингүй болсон эсвэл асуух зүйл гарвал'),
    ].join('\n'),
    cta: { label: 'Нууц үгээ тохируулах', url: input.link },
    footerNote: 'Энэ урилга танд хамаагүй бол үл тоомсорлоно уу — 7 хоногийн дараа хүчингүй болно.',
  };
}

export function passwordResetEmail(input: {
  name?: string | null;
  email: string;
  link: string;
}): EmailMessage {
  return {
    subject: 'Нууц үгээ сэргээх — GKSedu.mn',
    eyebrow: 'Аюулгүй байдал',
    tone: 'info',
    heading: 'Нууц үгээ сэргээх',
    body: [
      greeting(input.name),
      '',
      'Та GKSedu.mn дээрх нууц үгээ сэргээх хүсэлт илгээсэн байна. Доорх товчоор орж ' +
        'шинэ нууц үгээ тохируулна уу.',
      '',
      `Бүртгэл: ${input.email}`,
      'Холбоос хүчинтэй: 1 цаг',
    ].join('\n'),
    cta: { label: 'Шинэ нууц үг тохируулах', url: input.link },
    footerNote:
      'Хэрэв та энэ хүсэлтийг илгээгээгүй бол юу ч хийх шаардлагагүй — нууц үг тань хэвээр ' +
      `үлдэнэ. Санаа зовниж байвал ${PHONE} руу залгаарай.`,
  };
}

/** A Google-only account has no password; a dead end here would just confuse. */
export function passwordResetGoogleEmail(input: {
  name?: string | null;
  loginUrl: string;
}): EmailMessage {
  return {
    subject: 'Нууц үг сэргээх хүсэлт — GKSedu.mn',
    eyebrow: 'Аюулгүй байдал',
    tone: 'info',
    heading: 'Энэ бүртгэл Google-ээр нэвтэрдэг',
    body: [
      greeting(input.name),
      '',
      'Танай бүртгэл нууц үггүй — Google данснаасаа шууд нэвтэрдэг тул сэргээх зүйл алга.',
      '',
      '"Google-ээр нэвтрэх" товчийг ашиглан орно уу. Нууц үг тохируулмаар бол нэвтэрсний ' +
        'дараа профайл хэсгээсээ үүсгэх боломжтой.',
    ].join('\n'),
    cta: { label: 'Нэвтрэх', url: input.loginUrl },
    footerNote: 'Хэрэв та энэ хүсэлтийг илгээгээгүй бол үл тоомсорлоно уу.',
  };
}

export function passwordChangedEmail(input: {
  name?: string | null;
  loginUrl: string;
}): EmailMessage {
  return {
    subject: 'Нууц үг шинэчлэгдлээ — GKSedu.mn',
    eyebrow: 'Аюулгүй байдал',
    tone: 'success',
    heading: 'Нууц үг тань шинэчлэгдлээ',
    body: [
      greeting(input.name),
      '',
      'Таны GKSedu.mn бүртгэлийн нууц үг саяхан шинэчлэгдлээ. Аюулгүй байдлын үүднээс бүх ' +
        'төхөөрөмж дээрх нэвтрэлтийг хаалаа — дахин нэвтэрнэ үү.',
    ].join('\n'),
    cta: { label: 'Нэвтрэх', url: input.loginUrl },
    footerNote: `Хэрэв энэ таны үйлдэл биш бол яаралтай ${PHONE} руу залган бидэнд мэдэгдээрэй.`,
  };
}

/** The enquirer's receipt for a website consultation request (1A-15). */
export function leadReceivedEmail(input: {
  name: string;
  phone: string;
  email: string;
  services: string[];
  universitiesUrl: string;
}): EmailMessage {
  return {
    subject: 'Хүсэлтийг тань хүлээн авлаа — GKS EDU GROUP',
    eyebrow: 'Зөвлөгөө',
    tone: 'success',
    heading: 'Хүсэлтийг тань хүлээн авлаа',
    body: [
      greeting(input.name),
      '',
      'Зөвлөгөө авах хүсэлтийг тань хүлээн авлаа. Манай зөвлөх ажлын 1 өдрийн дотор таны ' +
        'утсаар холбогдож, тохирох сургууль, хөтөлбөр, төсвийг тань тодруулна.',
      '',
      `Утас: ${input.phone}`,
      `Имэйл: ${input.email}`,
      ...(input.services.length ? [`Сонирхсон: ${input.services.join(', ')}`] : []),
      '',
      'Хүлээх зуураа сургуулиудын мэдээлэлтэй танилцаж, өөрт тохирохыг нь хадгалж болно.',
    ].join('\n'),
    cta: { label: 'Сургуулиуд харах', url: input.universitiesUrl },
    footerNote: `Яаралтай бол ${PHONE} дугаараар шууд холбогдоорой.`,
  };
}

/**
 * 1C-33 — the six digits that turn "I agree" into a signature.
 *
 * The code goes to the address the account is registered under, never to one
 * typed on the page: an address the signer supplies at signing time verifies
 * nothing. So the mail names the contract and its amount — landing in the
 * right inbox is the check, and the reader is the one person who can tell
 * whether what it describes is what they just agreed to.
 */
export function contractSignOtpEmail(input: {
  name?: string | null;
  code: string;
  contractNumber: string;
  totalAmount: string;
  serviceName: string;
  minutes: number;
}): EmailMessage {
  return {
    subject: `Гэрээ баталгаажуулах код — ${input.contractNumber}`,
    eyebrow: 'Гэрээ',
    tone: 'info',
    heading: 'Цахим гарын үсгээ баталгаажуулна уу',
    preheader: 'Кабинетдаа оруулах 6 оронтой код.',
    body: [
      greeting(input.name),
      '',
      'Та зуучлалын гэрээний нөхцөлийг зөвшөөрлөө. Доорх кодыг кабинетдаа оруулснаар ' +
        'гэрээ цахимаар гарын үсэг зурагдаж, хүчин төгөлдөр болно.',
      '',
      `Гэрээний дугаар: ${input.contractNumber}`,
      `Үйлчилгээ: ${input.serviceName}`,
      `Нийт төлбөр: ${input.totalAmount}₮`,
    ].join('\n'),
    code: { value: input.code, note: `Код ${input.minutes} минутын хугацаатай.` },
    cta: null,
    footerNote:
      'Кодоо хэнд ч бүү дамжуулаарай — GKS EDU GROUP-ын ажилтан танаас код асуухгүй. Хэрэв ' +
      `та гэрээ байгуулах хүсэлт илгээгээгүй бол кодыг оруулалгүй ${PHONE} руу яаралтай залгаарай.`,
  };
}
