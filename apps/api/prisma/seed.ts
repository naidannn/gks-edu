import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import {
  BalanceTrigger,
  DocStage,
  EducationLevel,
  GuarantorRelation,
  GuarantorType,
  Necessity,
  type Prisma,
  PrepaymentMode,
  PrismaClient,
  Role,
  ServiceType,
} from '../src/generated/prisma/client.js';
import { buildCaseFlowDefinitions } from '../src/modules/cases/case-flow.js';
import { NOTIFICATION_TEMPLATES } from '../src/modules/notifications/notification-templates.data.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({
  // Seeding writes DDL-free data; the pooled URL is fine.
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DIMENSIONS = Number.parseInt(process.env.EMBEDDING_DIMENSIONS ?? '1536', 10);

/** Mirrors EmbeddingService.pseudoEmbed so seeded vectors match runtime search. */
function pseudoEmbed(text: string): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  let state = createHash('sha256').update(text).digest().readUInt32BE(0) || 1;

  for (let i = 0; i < DIMENSIONS; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    vector[i] = (state / 0xffffffff) * 2 - 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

async function seedServicePricing(): Promise<void> {
  const anchor = new Date('2024-01-01T00:00:00Z');
  const regularServiceTypes: ServiceType[] = [ServiceType.LANGUAGE_PREP, ServiceType.BACHELOR, ServiceType.MASTER, ServiceType.PHD];

  for (const serviceType of regularServiceTypes) {
    const exists = await prisma.servicePricing.findFirst({ where: { serviceType } });
    if (exists) continue;
    await prisma.servicePricing.create({
      data: {
        serviceType,
        totalAmount: 1_200_000,
        prepaymentMode: PrepaymentMode.FIXED,
        prepaymentValue: 200_000,
        balanceTrigger: BalanceTrigger.AFTER_VISA_APPROVED,
        effectiveFrom: anchor,
      },
    });
  }

  const gksExists = await prisma.servicePricing.findFirst({ where: { serviceType: ServiceType.GKS_SCHOLARSHIP } });
  if (!gksExists) {
    await prisma.servicePricing.create({
      data: {
        serviceType: ServiceType.GKS_SCHOLARSHIP,
        totalAmount: 5_000_000,
        prepaymentMode: PrepaymentMode.FIXED,
        prepaymentValue: 1_500_000,
        balanceTrigger: BalanceTrigger.AFTER_SCHOLARSHIP_RESULT,
        effectiveFrom: anchor,
      },
    });
  }
}

async function seedCaseFlowDefinitions(): Promise<void> {
  await prisma.caseFlowDefinition.createMany({ data: buildCaseFlowDefinitions(), skipDuplicates: true });
}

/** Draft body per service (gksedu.md §5.4 field list) — admin edits the text via 1C-06. */
function defaultContractBody(serviceLabel: string): string {
  return `ЗУУЧЛАЛЫН ГЭРЭЭ

Огноо: {{contractDate}}
Хэрэглэгч: {{userName}} (РД: {{userRegister}})
Байгууллага: Жи Кэй Эс Эдү Групп ХХК

1. Үйлчилгээ: ${serviceLabel}
2. Зорилтот сургууль: {{universityName}}
3. Үйлчилгээний нийт төлбөр: {{totalAmount}}₮
4. Урьдчилгаа төлбөр: {{prepaymentAmount}}₮
5. Үлдэгдэл төлбөр: {{balanceAmount}}₮
6. Төлбөрийн хуваарь: {{paymentSchedule}}
7. Байгууллагын хүлээх үүрэг: {{companyObligations}}
8. Хэрэглэгчийн хүлээх үүрэг: {{clientObligations}}
9. Материал бүрдүүлэх хугацаа: {{documentDeadline}}
10. Буцаалтын нөхцөл: {{refundTerms}}
11. Виз татгалзсан үеийн нөхцөл: {{visaRejectionTerms}}
12. Үйлчилгээ дуусах нөхцөл: {{serviceEndTerms}}
13. Нэмэлт үйлчилгээний нөхцөл: {{extraServiceTerms}}

Талууд дээрх нөхцөлийг зөвшөөрч гарын үсэг зурав.`;
}

const CONTRACT_TEMPLATE_LABELS: Record<ServiceType, string> = {
  [ServiceType.LANGUAGE_PREP]: 'Солонгос хэлний бэлтгэлийн зуучлал',
  [ServiceType.BACHELOR]: 'Бакалаврын зэргийн зуучлал',
  [ServiceType.MASTER]: 'Магистрын зэргийн зуучлал',
  [ServiceType.PHD]: 'Докторын зэргийн зуучлал',
  [ServiceType.GKS_SCHOLARSHIP]: 'БНСУ-ын Засгийн газрын тэтгэлгийн зуучлал',
};

async function seedContractTemplates(): Promise<void> {
  for (const [serviceType, label] of Object.entries(CONTRACT_TEMPLATE_LABELS) as [ServiceType, string][]) {
    const exists = await prisma.contractTemplate.findFirst({ where: { serviceType } });
    if (exists) continue;
    await prisma.contractTemplate.create({
      data: { serviceType, version: 1, isActive: true, bodyMn: defaultContractBody(label) },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1D-05 — the real requirement base, transcribed from
// `docs/Burduuleh_materialiin_jagsaalt_negdsen.docx`: the two education tracks
// (ЕБС / их сургууль төгссөн) × three guarantor occupations, plus the kinship
// reference. 1F-03 adds the visa-stage rules on the same engine.
// ─────────────────────────────────────────────────────────────────────────────

const E_MONGOLIA = 'E-Mongolia-аас';
const UNI_LEVELS: EducationLevel[] = [EducationLevel.BACHELOR, EducationLevel.MASTER, EducationLevel.PHD];

type TemplateSeed = Omit<Prisma.DocumentTemplateCreateInput, 'rules' | 'caseDocuments'>;

const DOCUMENT_TEMPLATES: TemplateSeed[] = [
  // ── Identity, needed by everyone.
  {
    code: 'PASSPORT',
    nameMn: 'Гадаад паспорт',
    descriptionMn: 'Хүчинтэй хугацаа нь суралцах хугацааг бүрэн хамарсан байх шаардлагатай.',
    tipsMn: 'Мэдээллийн хуудсыг өнгөт, тод сканнердана.',
    needsPhysicalOriginal: true,
  },
  {
    code: 'ID_REF_EN',
    nameMn: 'Иргэний үнэмлэхийн англи лавлагаа',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'PARENT_ID_REF_EN',
    nameMn: 'Эцэг, эхийн иргэний үнэмлэхийн англи лавлагаа',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'BIRTH_CERT_REF_EN',
    nameMn: 'Төрсний бүртгэлийн англи лавлагаа',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },

  // ── Education — the ЕБС track.
  {
    code: 'HS_GRADUATION_REF',
    nameMn: 'Бүрэн дунд боловсрол эзэмшсэн тухай сургуулийн тодорхойлолт',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'HS_TRANSCRIPT',
    nameMn: 'Ахлах сургуулийн дүнгийн тодорхойлолт (10–12 дугаар анги)',
    issuerHint: 'Төгссөн сургууль',
    needsTranslation: true,
    needsNotary: true,
  },
  {
    code: 'HS_DIPLOMA',
    nameMn: 'Бүрэн дунд боловсролын гэрчилгээ / аттестат',
    descriptionMn: 'Эх хувиар авчирч, оффис дээр хуулбарыг баталгаажуулна.',
    needsPhysicalOriginal: true,
    needsTranslation: true,
    needsNotary: true,
  },

  // ── Education — the university track.
  {
    code: 'UNI_GRADUATION_REF',
    nameMn: 'Их, дээд сургууль төгссөн тухай сургуулийн тодорхойлолт',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'UNI_TRANSCRIPT',
    nameMn: 'Их сургуулийн дүнгийн тодорхойлолт (1–4 дүгээр курс)',
    issuerHint: 'Төгссөн их сургууль',
    needsTranslation: true,
    needsNotary: true,
  },
  {
    code: 'UNI_DIPLOMA',
    nameMn: 'Их сургуулийн диплом',
    needsPhysicalOriginal: true,
    needsTranslation: true,
    needsNotary: true,
  },

  // ── Money and merit.
  {
    code: 'BANK_REF',
    nameMn: 'Банкны тодорхойлолт',
    descriptionMn: 'Манай байгууллагаас шаардсан үед авна.',
    issuerHint: 'Арилжааны банк',
    validityDays: 30,
  },
  {
    code: 'AWARDS',
    nameMn: 'Шагнал, урамшуулал, өргөмжлөл',
    descriptionMn: 'Байгаа тохиолдолд мэдүүлгийг дэмжинэ.',
  },

  // ── Guarantor: employee.
  {
    code: 'SOCIAL_INSURANCE_REF_EN',
    nameMn: 'Нийгмийн даатгалын лавлагаа (англи хэлээр)',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'EMPLOYER_REF',
    nameMn: 'Ажлын газрын тодорхойлолт',
    issuerHint: 'Ажил олгогч байгууллага',
    needsTranslation: true,
    validityDays: 30,
  },

  // ── Guarantor: company director.
  {
    code: 'COMPANY_REF',
    nameMn: 'Хуулийн этгээдийн дэлгэрэнгүй лавлагаа',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'TAX_REF_EN',
    nameMn: 'Татварын тодорхойлолт (англи хэлээр)',
    issuerHint: 'Татварын алба',
    validityDays: 30,
  },
  {
    code: 'BANK_STATEMENT',
    nameMn: 'Хураангуй дансны хуулга',
    issuerHint: 'Арилжааны банк',
    validityDays: 30,
  },

  // ── Guarantor: self-employed.
  { code: 'LEASE_CONTRACT', nameMn: 'Түрээсийн гэрээ', needsTranslation: true },
  { code: 'LEASE_REF', nameMn: 'Түрээсийн тодорхойлолт', needsTranslation: true, validityDays: 30 },

  // ── Guarantor who is not a parent.
  {
    code: 'KINSHIP_REF',
    nameMn: 'Төрөл садангийн лавлагаа',
    descriptionMn: 'Ах, эгч, авга, нагац зэрэг хүн батлан даагчаар орж байгаа тохиолдолд.',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },

  // ── Visa stage (1F-03).
  {
    code: 'VISA_FORM',
    nameMn: 'Визний анкет',
    descriptionMn: 'БНСУ-ын Элчин сайдын яамны маягтын дагуу бөглөнө.',
    tipsMn: 'Анкетыг ажилтан хамт бөглөж, шалгаж өгнө.',
  },
  {
    code: 'VISA_PHOTO',
    nameMn: 'Цээж зураг (3.5 × 4.5 см)',
    descriptionMn: 'Сүүлийн 6 сард авахуулсан, цагаан дэвсгэртэй.',
    needsPhysicalOriginal: true,
  },
  {
    code: 'ADMISSION_LETTER',
    nameMn: 'Сургуулийн элсэлтийн батламж / урилга',
    issuerHint: 'Элсэх сургууль',
  },
  {
    code: 'TUITION_RECEIPT',
    nameMn: 'Сургалтын төлбөр төлсөн баримт',
    descriptionMn: 'Банкны шилжүүлгийн баримт, сургуулийн баталгаажуулалттай.',
  },
  {
    code: 'BANK_BALANCE_CERT',
    nameMn: 'Дансны үлдэгдлийн баталгаа (санхүүгийн нотлох баримт)',
    descriptionMn: 'Шаардагдах дүн нь визний төрөл, сургуулиас хамаарна.',
    issuerHint: 'Арилжааны банк',
    validityDays: 30,
  },
  {
    code: 'FAMILY_REF_EN',
    nameMn: 'Гэр бүлийн лавлагаа (англи хэлээр)',
    sourceHint: E_MONGOLIA,
    validityDays: 30,
  },
  {
    code: 'TB_TEST',
    nameMn: 'Сүрьеэгийн шинжилгээний бичиг',
    descriptionMn: 'БНСУ-ын Элчин сайдын яамнаас зөвшөөрсөн эмнэлгээс авна.',
    needsPhysicalOriginal: true,
  },
  {
    code: 'VISA_FEE_RECEIPT',
    nameMn: 'Визний хураамжийн баримт',
  },
];

/** `[templateCode, rule]` — the rule's `templateId` is filled in after upsert. */
type RuleSeed = [string, Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>];

function admissionRules(): RuleSeed[] {
  const rules: RuleSeed[] = [];
  let order = 0;
  const add = (code: string, rule: Partial<Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>> = {}) => {
    rules.push([code, { stage: DocStage.ADMISSION, necessity: Necessity.REQUIRED, sortOrder: (order += 10), ...rule }]);
  };

  // I. Үндсэн материал — identical on both tracks.
  add('PASSPORT');
  add('ID_REF_EN');
  add('PARENT_ID_REF_EN');
  add('BIRTH_CERT_REF_EN');

  // The education papers are the only thing the two tracks disagree on.
  add('HS_GRADUATION_REF', { educationLevels: [EducationLevel.SECONDARY_SCHOOL] });
  add('HS_TRANSCRIPT', { educationLevels: [EducationLevel.SECONDARY_SCHOOL] });
  add('UNI_GRADUATION_REF', { educationLevels: UNI_LEVELS });
  add('UNI_TRANSCRIPT', { educationLevels: UNI_LEVELS });
  add('HS_DIPLOMA');
  add('UNI_DIPLOMA', { educationLevels: UNI_LEVELS });

  add('BANK_REF', { necessity: Necessity.CONDITIONAL, conditionNote: 'Манай байгууллагаас шаардсан үед' });
  add('AWARDS', { necessity: Necessity.OPTIONAL, conditionNote: 'Байгаа тохиолдолд' });

  // II. Батлан даагчийн материал — one branch per occupation.
  add('SOCIAL_INSURANCE_REF_EN', { guarantorTypes: [GuarantorType.EMPLOYEE] });
  add('EMPLOYER_REF', { guarantorTypes: [GuarantorType.EMPLOYEE] });
  add('COMPANY_REF', { guarantorTypes: [GuarantorType.COMPANY_DIRECTOR] });
  add('TAX_REF_EN', { guarantorTypes: [GuarantorType.COMPANY_DIRECTOR] });
  add('LEASE_CONTRACT', { guarantorTypes: [GuarantorType.SELF_EMPLOYED] });
  add('LEASE_REF', { guarantorTypes: [GuarantorType.SELF_EMPLOYED] });
  add('BANK_STATEMENT', { guarantorTypes: [GuarantorType.COMPANY_DIRECTOR, GuarantorType.SELF_EMPLOYED] });

  // III. Нэмэлт материал — only when the sponsor is not a parent.
  add('KINSHIP_REF', {
    guarantorRelations: [GuarantorRelation.SIBLING, GuarantorRelation.UNCLE_AUNT, GuarantorRelation.OTHER],
  });

  return rules;
}

function visaRules(): RuleSeed[] {
  const rules: RuleSeed[] = [];
  let order = 0;
  const add = (code: string, rule: Partial<Omit<Prisma.RequirementRuleUncheckedCreateInput, 'templateId'>> = {}) => {
    rules.push([code, { stage: DocStage.VISA, necessity: Necessity.REQUIRED, sortOrder: (order += 10), ...rule }]);
  };

  add('VISA_FORM');
  add('VISA_PHOTO');
  add('PASSPORT');
  add('ADMISSION_LETTER');
  add('TUITION_RECEIPT');
  add('BANK_BALANCE_CERT');
  add('FAMILY_REF_EN');
  // D-4 language training is the visa the tuberculosis certificate is asked for.
  add('TB_TEST', { serviceTypes: [ServiceType.LANGUAGE_PREP] });
  add('VISA_FEE_RECEIPT', { necessity: Necessity.CONDITIONAL, conditionNote: 'Виз мэдүүлсний дараа' });

  return rules;
}

async function seedDocumentTemplates(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const template of DOCUMENT_TEMPLATES) {
    // Update, so a wording fix in this file reaches an existing database — but
    // never touch `isActive`, which an admin may have deliberately turned off.
    const row = await prisma.documentTemplate.upsert({
      where: { code: template.code },
      update: { ...template, isActive: undefined },
      create: template,
    });
    ids.set(template.code, row.id);
  }
  return ids;
}

async function seedRequirementRules(templateIds: Map<string, string>): Promise<void> {
  // Rules carry no natural key, so the seed owns exactly the rows it created:
  // re-seeding replaces the universal (non-school-specific) rule base and leaves
  // any rule an admin attached to one university (1D-18) alone.
  const seeded = [...admissionRules(), ...visaRules()];
  const codes = new Set(seeded.map(([code]) => code));

  await prisma.requirementRule.deleteMany({
    where: { universityId: null, template: { code: { in: [...codes] } } },
  });

  await prisma.requirementRule.createMany({
    data: seeded.map(([code, rule]) => ({ ...rule, templateId: templateIds.get(code)! })),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1F-07 — pre-departure checklist (gksedu.md §11), cloned into every plan.
// ─────────────────────────────────────────────────────────────────────────────

const DEPARTURE_CHECKLIST: Prisma.DepartureChecklistTemplateCreateInput[] = [
  { code: 'FLIGHT_TICKET', titleMn: 'Онгоцны билет захиалах', descriptionMn: 'Хичээл эхлэхээс 3–5 хоногийн өмнө буух өдрөөр сонгоно.', offsetDays: 30, sortOrder: 10 },
  { code: 'INSURANCE', titleMn: 'Аялал, эрүүл мэндийн даатгал', descriptionMn: 'Суралцах хугацааг бүтэн хамарсан даатгал.', offsetDays: 21, sortOrder: 20 },
  { code: 'PICKUP', titleMn: 'Сургуулийн тосох үйлчилгээ', descriptionMn: 'Онгоцны буудлаас тосох хүсэлтийг урьдчилан илгээнэ.', offsetDays: 14, sortOrder: 30 },
  { code: 'HOUSING', titleMn: 'Байр, дотуур байрны мэдээлэл', descriptionMn: 'Дотуур байрны захиалга эсвэл түрээсийн гэрээ.', offsetDays: 30, sortOrder: 40 },
  { code: 'PRE_DEPARTURE_TRAINING', titleMn: 'Явахын өмнөх сургалт', descriptionMn: 'Оффис дээр буюу онлайнаар зохион байгуулна.', offsetDays: 14, sortOrder: 50 },
  { code: 'LUGGAGE', titleMn: 'Ачаа тээшний зөвлөгөө', descriptionMn: 'Жингийн хязгаар, авч болохгүй зүйлс.', offsetDays: 7, sortOrder: 60 },
  { code: 'BORDER', titleMn: 'Хилээр нэвтрэх зөвлөгөө', descriptionMn: 'Гаалийн мэдүүлэг, шаардлагатай бичиг баримт гар тээшинд.', offsetDays: 3, sortOrder: 70 },
  { code: 'KOREA_REGISTRATION', titleMn: 'Солонгост бүртгүүлэх заавар', descriptionMn: 'Ирсэн даруйд сургуулийн бүртгэл, оршин суух бүртгэл.', offsetDays: null, sortOrder: 80 },
  { code: 'ARC', titleMn: 'Гадаадын иргэний үнэмлэх (ARC)', descriptionMn: 'Ирснээс хойш 90 хоногийн дотор мэдүүлнэ.', offsetDays: null, sortOrder: 90 },
  { code: 'BANK_ACCOUNT', titleMn: 'Банкны данс нээлгэх', descriptionMn: 'ARC гарсны дараа нээлгэх боломжтой.', offsetDays: null, sortOrder: 100 },
  { code: 'SIM', titleMn: 'Гар утас, SIM карт', descriptionMn: 'Эхний өдрүүдэд урьдчилсан төлбөрт SIM хамгийн хялбар.', offsetDays: null, sortOrder: 110 },
  { code: 'TRANSPORT', titleMn: 'Нийтийн тээвэр (T-money)', descriptionMn: 'Метро, автобусны карт нэн даруй авна.', offsetDays: null, sortOrder: 120 },
  { code: 'LIVING_COST', titleMn: 'Амьдрах зардлын төлөвлөгөө', descriptionMn: 'Сарын хоол, байр, тээврийн зардлын тооцоо.', offsetDays: 7, sortOrder: 130 },
  { code: 'ROUTE', titleMn: 'Сургуулийн байршил, маршрут', descriptionMn: 'Буудлаас сургууль хүртэлх зам, ойролцоох буудал.', offsetDays: 3, sortOrder: 140 },
  { code: 'EMERGENCY', titleMn: 'Яаралтай үед холбогдох мэдээлэл', descriptionMn: 'Элчин сайдын яам, сургууль, GKS-ийн жижүүрийн дугаар.', offsetDays: 3, sortOrder: 150 },
];

async function seedDepartureChecklist(): Promise<void> {
  for (const item of DEPARTURE_CHECKLIST) {
    await prisma.departureChecklistTemplate.upsert({
      where: { code: item.code },
      update: { ...item, isActive: undefined },
      create: item,
    });
  }
}

async function main(): Promise<void> {
  const password = await hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@gks.edu' },
    update: {},
    create: { email: 'admin@gks.edu', password, name: 'Admin', role: Role.ADMIN },
  });

  // CRM staff account (0-07) — for exercising 1B's Lead/CRM endpoints.
  await prisma.user.upsert({
    where: { email: 'consultant@gks.edu' },
    update: {},
    create: { email: 'consultant@gks.edu', password, name: 'Consultant', role: Role.CONSULTANT },
  });

  await prisma.user.upsert({
    where: { email: 'student@gks.edu' },
    update: {},
    create: { email: 'student@gks.edu', password, name: 'Student', role: Role.USER },
  });

  const chunks = [
    'Eigenvalues describe how a linear transformation scales its eigenvectors.',
    'A matrix is invertible exactly when its determinant is non-zero.',
    'Gram-Schmidt turns any basis into an orthonormal one.',
  ];

  const existing = await prisma.document.findFirst({ where: { title: 'Linear algebra basics' } });
  if (!existing) {
    const document = await prisma.document.create({
      data: {
        title: 'Linear algebra basics',
        source: 'seed',
        metadata: { subject: 'math', level: 'intro' },
        authorId: admin.id,
      },
    });

    for (const [index, content] of chunks.entries()) {
      const literal = `[${pseudoEmbed(content).join(',')}]`;
      await prisma.$executeRaw`
        INSERT INTO document_chunks (id, "documentId", "chunkIndex", content, embedding, "createdAt")
        VALUES (gen_random_uuid(), ${document.id}::uuid, ${index}, ${content}, ${literal}::vector, NOW())
      `;
    }
  }

  await seedServicePricing();
  await seedCaseFlowDefinitions();
  await seedContractTemplates();
  await seedRequirementRules(await seedDocumentTemplates());
  await seedDepartureChecklist();
  await seedNotificationTemplates();

  console.log(
    'Seed complete: admin@gks.edu / consultant@gks.edu / student@gks.edu (password: password123)',
  );
}

/**
 * 1G-06 — the §16 notification bodies. `update: {}` means an admin's edited
 * wording survives a re-seed; only missing rows are inserted.
 */
async function seedNotificationTemplates(): Promise<void> {
  for (const template of NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { event_channel: { event: template.event, channel: template.channel } },
      create: {
        event: template.event,
        channel: template.channel,
        titleMn: template.titleMn,
        bodyMn: template.bodyMn,
        linkMn: template.linkMn ?? null,
      },
      update: {},
    });
  }
  console.log(`Seeded ${NOTIFICATION_TEMPLATES.length} notification templates`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
