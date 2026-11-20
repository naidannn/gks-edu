import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { officeWallClock, peopleWorkbook } from './report-xlsx.js';
import type { ConsultationReportRow, PeopleReport } from './report-types.js';

/**
 * The workbooks leave the system as mail attachments, so what is checked here
 * is what a reader would notice first: the right sheets, the header where the
 * filter is, a time that reads as the office's clock, and a file name that says
 * which days it covers.
 */

const lead = (overrides: Partial<ConsultationReportRow> = {}): ConsultationReportRow => ({
  leadId: 'lead-1',
  lastName: 'Бат',
  firstName: 'Сараа',
  phone: '99112233',
  email: null,
  source: 'WEBSITE',
  stage: 'CONSULTED',
  interestedServices: ['BACHELOR', 'LANGUAGE_PREP'],
  interestedMajor: 'IT',
  assignedToName: 'Зөвлөх',
  requestedAt: '2026-11-03T01:30:00.000Z',
  consultedAt: '2026-11-04T02:00:00.000Z',
  clientCode: null,
  ...overrides,
});

const report: PeopleReport = {
  period: {
    preset: 'month',
    from: '2026-11-01',
    to: '2026-12-01',
    previousFrom: '2026-10-01',
    previousTo: '2026-11-01',
    labelMn: '2026 оны 11 сар',
    generatedAt: '2026-11-20T03:00:00.000Z',
  },
  clients: [
    {
      clientId: 'client-1',
      code: 'KH-2026-0042',
      lastName: 'Дорж',
      firstName: 'Тэмүүлэн',
      phone: '88001122',
      email: 'temuulen@example.com',
      serviceType: 'BACHELOR',
      universityNameMn: 'Сөүлийн их сургууль',
      targetMajor: null,
      source: 'OFFICE',
      consultantName: null,
      phase: 'ACTIVE',
      fromLead: true,
      registeredAt: '2026-11-10T01:00:00.000Z',
      contractSignedAt: '2026-11-10T02:00:00.000Z',
      prepaymentPaidAt: null,
    },
  ],
  requested: [lead(), lead({ leadId: 'lead-2', stage: 'NEW', consultedAt: null })],
  consulted: [lead()],
};

async function read(content: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(content as unknown as ArrayBuffer);
  return workbook;
}

describe('officeWallClock', () => {
  it('writes an instant as the Ulaanbaatar clock, which is what Excel will display', () => {
    // 01:00 UTC is 09:00 in the office.
    expect(officeWallClock('2026-11-10T01:00:00.000Z')?.toISOString()).toBe('2026-11-10T09:00:00.000Z');
  });

  it('moves a late-evening UTC instant onto the next office day', () => {
    expect(officeWallClock('2026-11-30T18:30:00.000Z')?.toISOString()).toBe('2026-12-01T02:30:00.000Z');
  });

  it('leaves an absent date empty rather than inventing one', () => {
    expect(officeWallClock(null)).toBeNull();
  });
});

describe('peopleWorkbook', () => {
  it('names the file by the days it covers, the last one inclusive', async () => {
    expect((await peopleWorkbook(report, 'clients')).filename).toBe('uilchluulegch-2026-11-01-2026-11-30.xlsx');
    expect((await peopleWorkbook(report, 'consultations')).filename).toBe('zuvluguu-2026-11-01-2026-11-30.xlsx');
  });

  it('puts the clients on one sheet with Mongolian labels and a real date', async () => {
    const workbook = await read((await peopleWorkbook(report, 'clients')).content);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Үйлчлүүлэгч болсон']);

    const sheet = workbook.worksheets[0]!;
    expect(sheet.getCell('A1').value).toBe('Үйлчлүүлэгч болсон хүмүүс · 2026 оны 11 сар');
    expect(sheet.getCell('A2').value).toBe('Нийт: 1');
    expect(sheet.getRow(4).getCell(2).value).toBe('Код');

    const row = sheet.getRow(5);
    expect(row.getCell(2).value).toBe('KH-2026-0042');
    expect(row.getCell(7).value).toBe('Бакалавр');
    expect(row.getCell(10).value).toBe('Оффист ирсэн');
    expect(row.getCell(13).value).toBe('Идэвхтэй');
    expect((row.getCell(14).value as Date).toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(row.getCell(16).value).toBeNull();
  });

  it('splits consultations into requested and consulted, in the same columns', async () => {
    const workbook = await read((await peopleWorkbook(report, 'consultations')).content);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Зөвлөгөө хүссэн', 'Зөвлөгөө авсан']);

    const [requested, consulted] = workbook.worksheets;
    expect(requested!.getCell('A2').value).toBe('Нийт: 2');
    expect(consulted!.getCell('A2').value).toBe('Нийт: 1');
    expect(requested!.getRow(4).values).toEqual(consulted!.getRow(4).values);
    expect(requested!.getRow(5).getCell(10).value).toBe('Зөвлөгөө өгсөн');
    expect(requested!.getRow(6).getCell(12).value).toBeNull();
  });

  it('says so in the sheet when there is nobody to list', async () => {
    const empty = { ...report, clients: [] };
    const sheet = (await read((await peopleWorkbook(empty, 'clients')).content)).worksheets[0]!;
    expect(sheet.getCell('A2').value).toBe('Энэ хугацаанд үйлчлүүлэгч бүртгэгдээгүй.');
  });
});
