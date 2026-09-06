/**
 * Renders the printable material checklist (1D-21) with sample data, so the
 * A4 layout can be checked without a real case.
 *
 *   pnpm checklist:preview [outfile.pdf]
 */
import { writeFileSync } from 'node:fs';
import { ChecklistPdfService, type ChecklistPdfDocument } from '../src/modules/documents/checklist-pdf.service.js';
import { DocumentStatus, Necessity } from '../src/prisma/client.js';

const row = (over: Partial<ChecklistPdfDocument> & { nameMn: string }): ChecklistPdfDocument => ({
  descriptionMn: null,
  sourceHint: null,
  issuerHint: null,
  needsTranslation: false,
  needsNotary: false,
  needsApostille: false,
  needsPhysicalOriginal: false,
  necessity: Necessity.REQUIRED,
  status: DocumentStatus.NOT_STARTED,
  conditionNote: null,
  dueAt: null,
  ...over,
});

const pdf = await new ChecklistPdfService().render({
  stage: 'ADMISSION',
  caseCode: 'GKS-2026-0417',
  clientName: 'Баяндалай Зориг',
  clientCode: 'KH-2026-0042',
  clientPhone: '8980-7061',
  serviceName: 'Бакалавр',
  universityName: 'Кёнхи их сургууль',
  programName: 'Бизнесийн удирдлага',
  intakeLabel: '2027 оны 3-р сарын элсэлт',
  deadlineLabel: '2027 оны 01 сарын 17',
  officerName: 'Д. Мөнхзул',
  officerPhone: '9000-7735',
  printedAt: new Date(2026, 8, 6),
  documents: [
    row({
      nameMn: 'Гадаад паспорт',
      descriptionMn: 'Хүчинтэй хугацаа нь суралцах хугацааг бүрэн хамарсан байна.',
      sourceHint: 'Иргэний бүртгэлийн газраас',
      status: DocumentStatus.ACCEPTED,
    }),
    row({
      nameMn: 'Бүрэн дунд боловсролын гэрчилгээ',
      sourceHint: 'Төгссөн сургуулиасаа',
      issuerHint: 'БШУЯ баталгаажуулна',
      needsTranslation: true,
      needsNotary: true,
      needsPhysicalOriginal: true,
      status: DocumentStatus.SUBMITTED,
      dueAt: new Date(2026, 10, 20),
    }),
    row({
      nameMn: 'Дүнгийн жагсаалт',
      descriptionMn: '9–12 дугаар ангийн дүн бүрэн, тамгатай.',
      needsTranslation: true,
      needsApostille: true,
      status: DocumentStatus.NEEDS_FIX,
      conditionNote: 'Дүнгийн жагсаалтад 12-р ангийн дүн дутуу байна',
    }),
    row({ nameMn: 'Иргэний үнэмлэхний хуулбар', sourceHint: 'E-Mongolia-аас' }),
    row({
      nameMn: 'Банкны тодорхойлолт (20,000 ам.доллар)',
      descriptionMn: 'Батлан даагчийн нэр дээр, сүүлийн 3 сарын гүйлгээтэй.',
      sourceHint: 'Банкнаас',
      needsTranslation: true,
      needsNotary: true,
      dueAt: new Date(2026, 11, 1),
    }),
    row({ nameMn: 'Ажлын газрын тодорхойлолт', necessity: Necessity.CONDITIONAL, conditionNote: 'Батлан даагч ажилтан бол' }),
    row({
      nameMn: 'Улсын бүртгэлийн гэрчилгээ',
      necessity: Necessity.CONDITIONAL,
      conditionNote: 'Батлан даагч компанийн захирал бол',
      needsNotary: true,
    }),
    row({ nameMn: 'Гэр бүлийн байдлын лавлагаа', necessity: Necessity.OPTIONAL, sourceHint: 'E-Mongolia-аас' }),
    row({ nameMn: 'Эрүүл мэндийн шинжилгээний хуудас', necessity: Necessity.OPTIONAL, needsTranslation: true }),
  ],
});

const out = process.argv[2] ?? 'checklist-preview.pdf';
writeFileSync(out, pdf);
console.log(`${out} — ${(pdf.length / 1024).toFixed(0)} KB`);
