import type { EmailMessage } from './email-template.js';

/**
 * The mails that are not notifications.
 *
 * A notification is something an admin may reword and a recipient may switch
 * off; these five carry a credential or a promise, so their copy lives in code
 * and they are sent directly rather than through the dispatcher. Keeping them
 * here — as pure functions from data to message — also means the preview
 * script renders exactly what production sends, instead of a copy that drifts.
 */

const PHONE = '7710-9000';

function greeting(name?: string | null): string {
  return `Сайн байна уу${name ? `, ${name}` : ''}.`;
}

/** 1B-17 — staff created the account; the client sets the password. */
export function accountClaimEmail(input: {
  name?: string | null;
  email: string;
  link: string;
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
