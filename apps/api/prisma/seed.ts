import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { hash } from 'bcryptjs';
import { createHash } from 'node:crypto';
import {
  BalanceTrigger,
  CaseStage,
  type Prisma,
  PrepaymentMode,
  PrismaClient,
  Role,
  ServiceType,
} from '../src/generated/prisma/client.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// 1C-04 — per-service stage graph, stored as `CaseFlowDefinition` rows (data,
// not a hardcoded map) because the regular-brokerage and GKS-scholarship
// families order BALANCE_PAID differently around the visa step (§9).
// ─────────────────────────────────────────────────────────────────────────────

const REGULAR_BASE: CaseStage[] = [
  CaseStage.CONTRACT_DRAFT,
  CaseStage.CONTRACT_SIGNED,
  CaseStage.PREPAYMENT_PAID,
  CaseStage.DOCUMENTS,
  CaseStage.APPLICATION_SUBMITTED,
  CaseStage.ADMITTED,
  CaseStage.TUITION_INVOICED,
  CaseStage.INVITATION_RECEIVED,
  CaseStage.VISA,
  CaseStage.VISA_APPROVED,
  CaseStage.BALANCE_PAID,
];

const TAIL = [CaseStage.PRE_DEPARTURE, CaseStage.DEPARTED, CaseStage.COMPLETED];

/** Case-stage sequence per service (ARCHITECTURE.md §5). */
const FLOWS: Record<ServiceType, CaseStage[]> = {
  [ServiceType.LANGUAGE_PREP]: [...REGULAR_BASE, CaseStage.COLLATERAL_CONTRACT, ...TAIL],
  [ServiceType.BACHELOR]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.MASTER]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.PHD]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.GKS_SCHOLARSHIP]: [
    CaseStage.CONTRACT_DRAFT,
    CaseStage.CONTRACT_SIGNED,
    CaseStage.PREPAYMENT_PAID,
    CaseStage.DOCUMENTS,
    CaseStage.APPLICATION_SUBMITTED,
    CaseStage.GKS_ROUND1_PASSED,
    CaseStage.GKS_ROUND2_PASSED,
    CaseStage.BALANCE_PAID,
    CaseStage.VISA,
    CaseStage.VISA_APPROVED,
    ...TAIL,
  ],
};

/** Only `PaymentsService.confirmPayment` / `ContractsService.sign` may make these — never a manual staff click. */
const SYSTEM_ONLY_TARGETS = new Set<CaseStage>([CaseStage.CONTRACT_SIGNED, CaseStage.PREPAYMENT_PAID, CaseStage.BALANCE_PAID]);
const ESCAPE_STAGES = [CaseStage.ON_HOLD, CaseStage.CANCELLED, CaseStage.REJECTED];
const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT];

function buildCaseFlowDefinitions(): Prisma.CaseFlowDefinitionCreateManyInput[] {
  const rows: Prisma.CaseFlowDefinitionCreateManyInput[] = [];

  for (const [serviceType, stages] of Object.entries(FLOWS) as [ServiceType, CaseStage[]][]) {
    stages.forEach((fromStage, index) => {
      const toStage = stages[index + 1];
      const isLastStage = index === stages.length - 1;

      if (toStage) {
        const isSystemOnly = SYSTEM_ONLY_TARGETS.has(toStage);
        rows.push({
          serviceType,
          fromStage,
          toStage,
          allowedRoles: isSystemOnly ? [] : STAFF_ROLES,
          isSystemOnly,
          sortOrder: index,
        });
      }

      if (!isLastStage) {
        for (const escape of ESCAPE_STAGES) {
          rows.push({ serviceType, fromStage, toStage: escape, allowedRoles: STAFF_ROLES, isSystemOnly: false, sortOrder: 900 });
        }
      }
    });

    // A staff member decides where a paused case resumes.
    for (const stage of stages) {
      rows.push({
        serviceType,
        fromStage: CaseStage.ON_HOLD,
        toStage: stage,
        allowedRoles: STAFF_ROLES,
        isSystemOnly: false,
        sortOrder: 901,
      });
    }
  }

  return rows;
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

  console.log(
    'Seed complete: admin@gks.edu / consultant@gks.edu / student@gks.edu (password: password123)',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
