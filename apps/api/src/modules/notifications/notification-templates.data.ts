import { NotificationChannel, NotificationEvent } from '../../prisma/client.js';

/**
 * The notifications of gksedu.md §16, plus the two staff triggers and the
 * account-lifecycle mails, written out in Mongolian (1G-06). These are *seed
 * defaults*: admins edit the rows in the database afterwards, and the seeder
 * never overwrites an edited row.
 *
 * Placeholders are `{{name}}` and resolve against the dispatcher's context —
 * see `NotificationsService.renderContext()` for what is always available
 * (`clientName`, `caseCode`, `universityName`, `link`, plus event extras).
 *
 * Channel policy (ARCHITECTURE.md §10): in-app for everything, email for
 * anything the client must act on, SMS only for the few events where being
 * late costs money or a place — SMS is billed per message.
 */
export interface NotificationTemplateSeed {
  event: NotificationEvent;
  channel: NotificationChannel;
  titleMn: string;
  bodyMn: string;
  linkMn?: string;
}

const CASE_DOCS = '/app/cases/{{caseId}}/documents';
const CASE_PAYMENT = '/app/cases/{{caseId}}/payment';
const CASE_APPLICATION = '/app/cases/{{caseId}}/application';
const CASE_VISA = '/app/cases/{{caseId}}/visa';
const CASE_DEPARTURE = '/app/cases/{{caseId}}/departure';
const CASE_CONTRACT = '/app/cases/{{caseId}}/contract';
const ADMIN_ADMISSIONS_BOARD = '/admin/admissions/board';

export const NOTIFICATION_TEMPLATES: NotificationTemplateSeed[] = [
  // ── Бүртгэл ──────────────────────────────────────────────────────────────
  {
    event: NotificationEvent.ACCOUNT_CREATED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'GKSedu.mn-д тавтай морил',
    bodyMn: 'Таны бүртгэл үүслээ. Хаанаас эхлэхээ мэдэхгүй бол хэрэгцээгээ хэдхэн алхмаар тодруулаарай.',
    linkMn: '/app/start',
  },
  {
    event: NotificationEvent.ACCOUNT_CREATED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'GKSedu.mn-д тавтай морил',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны бүртгэл амжилттай үүслээ. Одооноос Солонгост суралцах замын бүх алхмаа ' +
      'нэг кабинетаас хөтлөх боломжтой боллоо.\n\n' +
      'Кабинетаараа дараах зүйлийг хийнэ:\n' +
      '- 135 сургуулийн мэдээллийг харьцуулж, сонирхсоноо хадгалах\n' +
      '- Зуучлалын гэрээгээ онлайнаар байгуулах\n' +
      '- Материалаа илгээж, хянагдаж буй явцыг хөтлөх\n' +
      '- Төлбөрөө QPay-ээр төлж, түүхээ харах\n\n' +
      'Бүртгэлтэй имэйл: {{userEmail}}\n\n' +
      'Асуух зүйл гарвал 7710-9000 дугаараар бидэнтэй холбогдоорой.\n\n' +
      'GKS EDU GROUP',
    linkMn: '/app/start',
  },

  // ── Материал (§6) ────────────────────────────────────────────────────────
  {
    event: NotificationEvent.DOCUMENT_DEADLINE_NEAR,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Материалын хугацаа дөхөж байна',
    bodyMn: '"{{documentName}}" материалыг {{dueDate}}-ны дотор ирүүлнэ үү. {{daysLeft}} хоног үлдлээ.',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_DEADLINE_NEAR,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Материалын хугацаа дөхөж байна — {{documentName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '"{{documentName}}" материалын эцсийн хугацаа {{dueDate}} — {{daysLeft}} хоног үлдлээ.\n' +
      'Хэрэг: {{caseCode}}\n\n' +
      'Материалаа кабинетаараа орж илгээнэ үү: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_DEADLINE_NEAR,
    channel: NotificationChannel.SMS,
    titleMn: 'Материалын хугацаа',
    bodyMn: 'GKSedu: "{{documentName}}" материалын хугацаа {{dueDate}}. {{daysLeft}} хоног үлдлээ.',
  },
  {
    event: NotificationEvent.DOCUMENT_MISSING,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Дутуу материал байна',
    bodyMn: '{{missingCount}} материал дутуу байна. Жагсаалтаа шалгаад ирүүлнэ үү.',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_MISSING,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Дутуу материал — {{caseCode}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны хэрэгт {{missingCount}} материал дутуу байна:\n{{missingList}}\n\n' +
      'Кабинетаараа орж илгээнэ үү: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_REJECTED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Материал буцаагдлаа',
    bodyMn: '"{{documentName}}" материал буцаагдлаа. Шалтгаан: {{reason}}',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_REJECTED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Материал буцаагдлаа — {{documentName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '"{{documentName}}" материалыг хүлээн авах боломжгүй байна.\n' +
      'Шалтгаан: {{reason}}\n\n' +
      'Засаад дахин илгээнэ үү: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_FIX_REQUIRED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Материал засвар шаардлагатай',
    bodyMn: '"{{documentName}}" материалд засвар хэрэгтэй байна: {{reason}}',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_FIX_REQUIRED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Материалд засвар шаардлагатай — {{documentName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '"{{documentName}}" материалд дараах засвар хэрэгтэй байна:\n{{reason}}\n\n' +
      'Кабинет: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },

  {
    event: NotificationEvent.DOCUMENT_APPROVED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Материал баталгаажлаа',
    bodyMn: '"{{documentName}}" материалыг хүлээн авлаа.',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.DOCUMENT_APPROVED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Материал баталгаажлаа — {{documentName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '"{{documentName}}" материалыг хянаж, хүлээн авлаа. Танд баярлалаа.\n\n' +
      'Хэрэг: {{caseCode}}\n' +
      'Үлдсэн материал: {{remainingCount}}\n\n' +
      'Бүрдүүлэлтийн явцаа кабинетаасаа хараарай.\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },

  // ── Гэрээ ба төлбөр (§5) ─────────────────────────────────────────────────
  {
    event: NotificationEvent.CONTRACT_CONFIRMED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Гэрээ баталгаажлаа',
    bodyMn: '{{serviceName}} үйлчилгээний гэрээ баталгаажлаа. Дараагийн алхам: урьдчилгаа төлбөр.',
    linkMn: CASE_CONTRACT,
  },
  {
    event: NotificationEvent.CONTRACT_CONFIRMED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Гэрээ баталгаажлаа — {{caseCode}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{serviceName}} үйлчилгээний зуучлалын гэрээ баталгаажлаа.\n' +
      'Гэрээний дугаар: {{contractNumber}}\n' +
      'Хэрэг: {{caseCode}}\n\n' +
      'Гэрээгээ кабинетаасаа татаж авах боломжтой: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_CONTRACT,
  },
  {
    event: NotificationEvent.CONTRACT_CONFIRMED,
    channel: NotificationChannel.SMS,
    titleMn: 'Гэрээ баталгаажлаа',
    bodyMn: 'GKSedu: {{serviceName}} гэрээ баталгаажлаа. Дугаар {{contractNumber}}.',
  },
  {
    event: NotificationEvent.PAYMENT_DUE,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Төлбөрийн хугацаа болсон',
    bodyMn: '{{paymentKindName}} {{amount}}₮ төлөх хугацаа болсон байна.',
    linkMn: CASE_PAYMENT,
  },
  {
    event: NotificationEvent.PAYMENT_DUE,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Төлбөрийн хугацаа болсон — {{amount}}₮',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{paymentKindName}} {{amount}}₮ төлөх хугацаа болсон байна.\n' +
      'Хэрэг: {{caseCode}}\n\n' +
      'QPay-ээр төлөх: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_PAYMENT,
  },
  {
    event: NotificationEvent.PAYMENT_DUE,
    channel: NotificationChannel.SMS,
    titleMn: 'Төлбөрийн хугацаа',
    bodyMn: 'GKSedu: {{paymentKindName}} {{amount}}₮ төлөх хугацаа болсон. Кабинетаараа орж төлнө үү.',
  },
  {
    event: NotificationEvent.PAYMENT_CONFIRMED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Төлбөр баталгаажлаа',
    bodyMn: '{{amount}}₮ төлбөр баталгаажлаа. Баярлалаа.',
    linkMn: CASE_PAYMENT,
  },
  {
    event: NotificationEvent.PAYMENT_CONFIRMED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Төлбөр баталгаажлаа — {{amount}}₮',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{paymentKindName}} {{amount}}₮ төлбөр амжилттай баталгаажлаа.\n' +
      'Гүйлгээний огноо: {{paidAt}}\n' +
      'Хэрэг: {{caseCode}}\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_PAYMENT,
  },
  {
    event: NotificationEvent.PAYMENT_CONFIRMED,
    channel: NotificationChannel.SMS,
    titleMn: 'Төлбөр баталгаажлаа',
    bodyMn: 'GKSedu: {{amount}}₮ төлбөр баталгаажлаа. Баярлалаа.',
  },

  // ── Мэдүүлэг (§7) ────────────────────────────────────────────────────────
  {
    event: NotificationEvent.APPLICATION_RESULT,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Сургуулийн хариу ирлээ',
    bodyMn: '{{universityName}}: {{decisionName}}',
    linkMn: CASE_APPLICATION,
  },
  {
    event: NotificationEvent.APPLICATION_RESULT,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Сургуулийн хариу ирлээ — {{universityName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{universityName}}-ийн {{roundName}} шатны хариу ирлээ: {{decisionName}}\n' +
      '{{resultNote}}\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_APPLICATION,
  },
  {
    event: NotificationEvent.APPLICATION_RESULT,
    channel: NotificationChannel.SMS,
    titleMn: 'Сургуулийн хариу',
    bodyMn: 'GKSedu: {{universityName}} — {{decisionName}}. Дэлгэрэнгүйг кабинетаасаа харна уу.',
  },
  {
    event: NotificationEvent.APPLICATION_EXTRA_DOCS,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Нэмэлт материал шаардлаа',
    bodyMn: '{{universityName}} нэмэлт материал хүслээ: {{requestedDocs}}',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.APPLICATION_EXTRA_DOCS,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Нэмэлт материал шаардлаа — {{universityName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{universityName}} дараах нэмэлт материалыг шаардаж байна:\n{{requestedDocs}}\n\n' +
      'Хугацаа: {{dueDate}}\n' +
      'Кабинет: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.INVITATION_RECEIVED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Урилга ирлээ',
    bodyMn: '{{universityName}}-аас урилга ирлээ. Визний бэлтгэл эхэлж байна.',
    linkMn: CASE_APPLICATION,
  },
  {
    event: NotificationEvent.INVITATION_RECEIVED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Урилга ирлээ — {{universityName}}',
    bodyMn:
      'Баяр хүргэе, {{clientName}}!\n\n' +
      '{{universityName}}-аас албан ёсны урилга ирлээ.\n' +
      'Урилгын дугаар: {{invitationNumber}}\n\n' +
      'Дараагийн алхам бол визний материал бүрдүүлэлт: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_APPLICATION,
  },
  {
    event: NotificationEvent.INVITATION_RECEIVED,
    channel: NotificationChannel.SMS,
    titleMn: 'Урилга ирлээ',
    bodyMn: 'GKSedu: {{universityName}}-аас урилга ирлээ. Визний бэлтгэл эхэллээ.',
  },

  // ── Виз (§8) ─────────────────────────────────────────────────────────────
  {
    event: NotificationEvent.VISA_STAGE_STARTED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Визний үе шат эхэллээ',
    bodyMn: '{{visaTypeName}} визний материал бүрдүүлэлт эхэллээ.',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_STAGE_STARTED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Визний үе шат эхэллээ — {{caseCode}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      '{{visaTypeName}} визний материал бүрдүүлэлт эхэллээ.\n' +
      'Шаардлагатай материалын жагсаалт кабинетад бэлэн боллоо: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_APPOINTMENT_DUE,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Виз мэдүүлэх өдөр болсон',
    bodyMn: '{{appointmentDate}}-нд Солонгосын Элчин сайдын яаманд виз мэдүүлнэ.',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_APPOINTMENT_DUE,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Виз мэдүүлэх өдөр — {{appointmentDate}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны виз мэдүүлэх өдөр: {{appointmentDate}}\n' +
      'Бүрдүүлсэн материалаа эх хувиар авч ирнэ үү.\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_APPOINTMENT_DUE,
    channel: NotificationChannel.SMS,
    titleMn: 'Виз мэдүүлэх өдөр',
    bodyMn: 'GKSedu: {{appointmentDate}}-нд виз мэдүүлнэ. Материалаа эх хувиар авч ирнэ үү.',
  },
  {
    event: NotificationEvent.VISA_RESULT,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Визний хариу бүртгэгдлээ',
    bodyMn: 'Визний хариу: {{visaStatusName}}',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_RESULT,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Визний хариу — {{visaStatusName}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны визний хариу бүртгэгдлээ: {{visaStatusName}}\n' +
      '{{resultNote}}\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_RESULT,
    channel: NotificationChannel.SMS,
    titleMn: 'Визний хариу',
    bodyMn: 'GKSedu: Визний хариу — {{visaStatusName}}. Дэлгэрэнгүйг кабинетаасаа харна уу.',
  },
  {
    event: NotificationEvent.VISA_RENEWAL_NEAR,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Виз сунгах хугацаа дөхөж байна',
    bodyMn: 'Таны визний хугацаа {{expiryDate}}-нд дуусна. {{daysLeft}} хоног үлдлээ.',
    linkMn: CASE_VISA,
  },
  {
    event: NotificationEvent.VISA_RENEWAL_NEAR,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Виз сунгах хугацаа дөхөж байна',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны визний хугацаа {{expiryDate}}-нд дуусна — {{daysLeft}} хоног үлдлээ.\n' +
      'Сунгалтын үйлчилгээ авах бол бидэнтэй холбогдоно уу.\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_VISA,
  },

  // ── Явах бэлтгэл (§10) ───────────────────────────────────────────────────
  {
    event: NotificationEvent.DEPARTURE_NEAR,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Явах өдөр дөхөж байна',
    bodyMn: '{{departureDate}}-нд хөдөлнө. {{daysLeft}} хоног үлдлээ — бэлтгэлийн жагсаалтаа шалгана уу.',
    linkMn: CASE_DEPARTURE,
  },
  {
    event: NotificationEvent.DEPARTURE_NEAR,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Явах өдөр дөхөж байна — {{departureDate}}',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны хөдлөх өдөр: {{departureDate}} ({{daysLeft}} хоног үлдлээ)\n' +
      'Явахын өмнөх бэлтгэлийн жагсаалтаа шалгаж, дуусаагүй зүйлээ гүйцээнэ үү.\n\n' +
      'Жагсаалт: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DEPARTURE,
  },
  {
    event: NotificationEvent.DEPARTURE_NEAR,
    channel: NotificationChannel.SMS,
    titleMn: 'Явах өдөр дөхлөө',
    bodyMn: 'GKSedu: {{departureDate}}-нд хөдөлнө. {{daysLeft}} хоног үлдлээ.',
  },
  {
    event: NotificationEvent.FLIGHT_INFO_UPDATED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Онгоцны мэдээлэл шинэчлэгдлээ',
    bodyMn: '{{flightNumber}} — {{departureDate}}. Мэдээллээ шалгана уу.',
    linkMn: CASE_DEPARTURE,
  },
  {
    event: NotificationEvent.FLIGHT_INFO_UPDATED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Онгоцны билетийн мэдээлэл шинэчлэгдлээ',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Онгоцны мэдээлэл шинэчлэгдлээ:\n' +
      'Нислэг: {{flightNumber}}\n' +
      'Хөдлөх: {{departureDate}}\n' +
      'Хүрэх: {{arrivalDate}}\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DEPARTURE,
  },

  // ── Ажилтны талын мэдэгдэл ───────────────────────────────────────────────
  {
    event: NotificationEvent.LEAD_CREATED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Шинэ сэжим ирлээ',
    bodyMn: '{{leadName}} ({{leadPhone}}) — {{sourceName}}. Сонирхсон: {{interestedServices}}',
    linkMn: '/admin/leads/{{leadId}}',
  },
  {
    event: NotificationEvent.LEAD_CREATED,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Шинэ сэжим — {{leadName}}',
    bodyMn:
      'Шинэ зөвлөгөөний хүсэлт ирлээ.\n\n' +
      'Нэр: {{leadName}}\n' +
      'Утас: {{leadPhone}}\n' +
      'Имэйл: {{leadEmail}}\n' +
      'Суваг: {{sourceName}}\n' +
      'Сонирхсон үйлчилгээ: {{interestedServices}}\n\n' +
      'CRM: {{link}}',
    linkMn: '/admin/leads/{{leadId}}',
  },
  {
    event: NotificationEvent.LEAD_FOLLOW_UP_DUE,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Холбогдох өдөр болсон',
    bodyMn: '{{leadName}} ({{leadPhone}}) — {{stageName}}. Холбогдох өдөр: {{nextContactDate}}',
    linkMn: '/admin/leads/{{leadId}}',
  },
  {
    event: NotificationEvent.LEAD_FOLLOW_UP_DUE,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Өнөөдөр холбогдох {{leadName}}',
    bodyMn:
      'Дараагийн холбогдох огноо болсон сэжим:\n\n' +
      'Нэр: {{leadName}}\n' +
      'Утас: {{leadPhone}}\n' +
      'Үе шат: {{stageName}}\n' +
      'Товлосон огноо: {{nextContactDate}}\n\n' +
      'CRM: {{link}}',
    linkMn: '/admin/leads/{{leadId}}',
  },
  // ── Элсэлтийн хугацаа (§4.1, §4.2 — 1H) ──────────────────────────────────
  //
  // `deadlineDate` is OUR deadline. The school's later one is deliberately
  // absent from every client-facing message: given both dates, people work to
  // the later one and arrive a week late.
  {
    event: NotificationEvent.INTAKE_DEADLINE_NEAR,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Элсэлтийн бүртгэлийн хугацаа дөхөж байна',
    bodyMn:
      '{{universityName}} — {{intakeName}}. Бүртгэлийн эцсийн хугацаа {{deadlineDate}} ' +
      '({{daysLeft}} хоног үлдлээ). Дутуу материалаа гүйцээнэ үү.',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.INTAKE_DEADLINE_NEAR,
    channel: NotificationChannel.EMAIL,
    titleMn: 'Элсэлтийн бүртгэл {{daysLeft}} хоногийн дараа хаагдана',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны сонгосон элсэлт: {{universityName}} — {{intakeName}}\n' +
      'Бүртгэлийн эцсийн хугацаа: {{deadlineDate}} ({{daysLeft}} хоног үлдлээ)\n\n' +
      'Дутуу материал: {{missingDocuments}}\n' +
      'Материалын жагсаалт: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: CASE_DOCS,
  },
  {
    event: NotificationEvent.INTAKE_DEADLINE_NEAR,
    channel: NotificationChannel.SMS,
    titleMn: 'Элсэлтийн хугацаа дөхлөө',
    bodyMn: 'GKSedu: {{universityName}} элсэлтийн бүртгэл {{deadlineDate}}-нд хаагдана. {{daysLeft}} хоног үлдлээ.',
  },
  {
    event: NotificationEvent.INTAKE_OPENED,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Хадгалсан сургуульд шинэ элсэлт нээгдлээ',
    bodyMn: '{{universityName}} — {{intakeName}}. Бүртгэл {{deadlineDate}} хүртэл нээлттэй.',
    linkMn: '/universities/{{universitySlug}}',
  },
  {
    event: NotificationEvent.INTAKE_OPENED,
    channel: NotificationChannel.EMAIL,
    titleMn: '{{universityName}} — шинэ элсэлт нээгдлээ',
    bodyMn:
      'Сайн байна уу, {{clientName}}.\n\n' +
      'Таны хадгалсан сургуульд шинэ элсэлт нээгдлээ:\n\n' +
      '{{universityName}} — {{intakeName}}\n' +
      'Хичээл эхлэх: {{classStartDate}}\n' +
      'Бүртгэлийн эцсийн хугацаа: {{deadlineDate}}\n\n' +
      'Дэлгэрэнгүй: {{link}}\n\n' +
      'GKS EDU GROUP',
    linkMn: '/universities/{{universitySlug}}',
  },

  // ── Ажилтанд: элсэлтээ алдаж болзошгүй хэрэг (1H-09) ─────────────────────
  //
  // The office's own words: "ажилтан хүртэл хэрэглэгчээ мартаад" — this is the
  // notification that makes that visible before the date passes.
  {
    event: NotificationEvent.INTAKE_CASE_AT_RISK,
    channel: NotificationChannel.IN_APP,
    titleMn: 'Элсэлтээ алдаж болзошгүй хэрэг',
    bodyMn:
      '{{caseCode}} — {{clientName}}. {{universityName}} {{intakeName}}: {{daysLeft}} хоног үлдэхэд ' +
      'материал {{readiness}}% бүрдсэн ({{missingDocuments}} дутуу).',
    linkMn: '/admin/cases/{{caseId}}',
  },
  {
    event: NotificationEvent.INTAKE_CASE_AT_RISK,
    channel: NotificationChannel.EMAIL,
    titleMn: '{{caseCode}} элсэлтээ алдаж болзошгүй — {{daysLeft}} хоног үлдлээ',
    bodyMn:
      'Анхаарал шаардсан хэрэг:\n\n' +
      'Хэрэг: {{caseCode}} — {{clientName}}\n' +
      'Элсэлт: {{universityName}} — {{intakeName}}\n' +
      'Манай бүртгэлийн эцсийн хугацаа: {{deadlineDate}} ({{daysLeft}} хоног үлдлээ)\n' +
      'Материалын бүрдэлт: {{readiness}}% ({{missingDocuments}} материал дутуу)\n\n' +
      'Элсэлтийн самбар: {{link}}',
    linkMn: ADMIN_ADMISSIONS_BOARD,
  },
];
