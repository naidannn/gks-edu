import { describe, expect, it } from 'vitest';
import { DocumentStatus, Necessity } from '../../prisma/client.js';
import { formatDateMn } from '../notifications/notification-labels.js';
import {
  ChecklistPdfService,
  checklistFilename,
  groupDocuments,
  hintLines,
  isCollected,
  requirementChips,
  summaryCells,
  type ChecklistPdfDocument,
  type ChecklistPdfParams,
} from './checklist-pdf.service.js';

const document = (over: Partial<ChecklistPdfDocument> = {}): ChecklistPdfDocument => ({
  nameMn: 'Гадаад паспорт',
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

const params = (over: Partial<ChecklistPdfParams> = {}): ChecklistPdfParams => ({
  stage: 'ADMISSION',
  caseCode: 'GKS-2026-0417',
  clientName: 'Баяндалай Зориг',
  clientCode: 'KH-2026-0042',
  clientPhone: '8980-7061',
  serviceName: 'Бакалавр',
  universityName: 'Кёнхи их сургууль',
  programName: null,
  intakeLabel: '2027 оны 3-р сарын элсэлт',
  deadlineLabel: null,
  officerName: null,
  officerPhone: null,
  printedAt: new Date(2026, 8, 6),
  documents: [document()],
  ...over,
});

describe('how the printed checklist is divided up', () => {
  it('puts what everyone must bring above what only some must', () => {
    const groups = groupDocuments([
      document({ nameMn: 'Паспорт' }),
      document({ nameMn: 'Ажлын газрын тодорхойлолт', necessity: Necessity.CONDITIONAL }),
      document({ nameMn: 'Эрүүл мэндийн хуудас', necessity: Necessity.OPTIONAL }),
    ]);

    expect(groups.map((group) => group.title)).toEqual(['Заавал бүрдүүлэх', 'Нөхцөлт ба нэмэлт материал']);
    expect(groups[1]?.documents).toHaveLength(2);
  });

  it('leaves out a section it has nothing to put in', () => {
    expect(groupDocuments([document()])).toHaveLength(1);
    expect(groupDocuments([])).toEqual([]);
  });

  it('counts a document in translation as collected — it is already in our hands', () => {
    expect(isCollected(DocumentStatus.IN_TRANSLATION)).toBe(true);
    expect(isCollected(DocumentStatus.SUBMITTED)).toBe(false);
  });
});

describe('what a row says about one document', () => {
  it('names every step the paper still needs', () => {
    const chips = requirementChips(
      document({ needsTranslation: true, needsNotary: true, needsApostille: true, needsPhysicalOriginal: true }),
    );
    expect(chips.map((chip) => chip.text)).toEqual(['ЭХ ХУВИАР', 'ОРЧУУЛГА', 'НОТАРИАТ', 'АПОСТИЛЬ']);
  });

  it('says nothing when nothing has to be done to it', () => {
    expect(requirementChips(document())).toEqual([]);
  });

  it('joins where to get it and who certifies it into one line', () => {
    expect(hintLines(document({ sourceHint: 'E-Mongolia-аас', issuerHint: 'БШУЯ' }))).toEqual([
      'E-Mongolia-аас · БШУЯ',
    ]);
  });
});

describe('the summary panel', () => {
  it('carries our deadline and never the school`s', () => {
    const labels = summaryCells(params({ deadlineLabel: '2027 оны 01 сарын 17' })).map((cell) => cell.label);
    expect(labels).toContain('Материал өгөх эцсийн хугацаа');
    expect(labels.join(' ')).not.toContain('сургуулийн');
  });

  it('leaves an unknown fact as a dash rather than inventing one', () => {
    const cells = summaryCells(params({ intakeLabel: null, officerName: null, officerPhone: null }));
    expect(cells.find((cell) => cell.label === 'Элсэлт')?.value).toBe('—');
    expect(cells.find((cell) => cell.label === 'Хариуцсан ажилтан')?.value).toBe('—');
  });
});

describe('dates and file names', () => {
  it('reads a deadline in UTC — stored end-of-day, it is a day late read locally', () => {
    expect(formatDateMn(new Date('2027-01-17T23:59:59.000Z'))).toBe('2027 оны 01 сарын 17');
  });

  it('names the file after the case and the stage', () => {
    expect(checklistFilename('GKS-2026-0417', 'VISA')).toBe('Бүрдүүлэх материал-GKS-2026-0417-Визний материал.pdf');
  });
});

describe('the rendered sheet', () => {
  it('is a PDF, letterheaded, and paginates a long list', async () => {
    const many = Array.from({ length: 40 }, (_, index) => document({ nameMn: `Материал ${index + 1}` }));
    const pdf = await new ChecklistPdfService().render(params({ documents: many }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // pdfkit writes one `/Type /Page` per sheet; 40 rows do not fit on one.
    expect((pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
  });

  it('renders an empty checklist rather than failing on it', async () => {
    const pdf = await new ChecklistPdfService().render(params({ documents: [] }));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
