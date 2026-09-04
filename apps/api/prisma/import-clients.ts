/**
 * 1B-12 — imports the office's existing client list into `clients`.
 *
 *   pnpm clients:import path/to/clients.csv            # dry run, reports what would happen
 *   pnpm clients:import path/to/clients.csv --commit   # actually writes
 *
 * The source is a CSV, not an .xlsx: Excel exports one in two clicks
 * ("Файл → Хадгалах → CSV UTF-8"), and it keeps a spreadsheet parser — and its
 * supply chain — out of the API. Save as **CSV UTF-8** so Cyrillic survives.
 *
 * Expected header (Mongolian, in any order; unknown columns are ignored):
 *
 *   овог, нэр, регистр, төрсөн огноо, хүйс, утас, утас2, имэйл, хаяг,
 *   боловсрол, сургууль, гэрээний үйлчилгээ, тэмдэглэл
 *
 * Matching and safety:
 *  - `регистр` is the identity. A row whose register number already exists is
 *    skipped, never overwritten — a spreadsheet is not the source of truth for
 *    a client the office has already been working with.
 *  - Every import is a dry run unless `--commit` is passed, and prints the
 *    exact rows it would create plus every row it rejected and why.
 *  - No case is opened: the service and university a client signed up for is a
 *    decision staff make in the CRM (1B-14), not something a legacy sheet knows.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EducationLevel, Gender, PrismaClient, type Prisma } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const filePath = args.find((arg) => !arg.startsWith('--'));
const commit = args.includes('--commit');

if (!filePath) {
  console.error('Хэрэглээ: pnpm clients:import <файл.csv> [--commit]');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Header aliases → the field the importer fills. */
const COLUMNS: Record<string, string> = {
  овог: 'lastName',
  нэр: 'firstName',
  регистр: 'registerNumber',
  'регистрийн дугаар': 'registerNumber',
  'төрсөн огноо': 'birthDate',
  хүйс: 'gender',
  утас: 'phone',
  'утас 2': 'phoneAlt',
  утас2: 'phoneAlt',
  имэйл: 'email',
  'и-мэйл': 'email',
  хаяг: 'address',
  боловсрол: 'educationLevel',
  сургууль: 'schoolName',
  тэмдэглэл: 'note',
};

const GENDERS: Record<string, Gender> = {
  эр: Gender.MALE,
  эрэгтэй: Gender.MALE,
  м: Gender.MALE,
  эм: Gender.FEMALE,
  эмэгтэй: Gender.FEMALE,
  ж: Gender.FEMALE,
};

const EDUCATION: Record<string, EducationLevel> = {
  'бүрэн дунд': EducationLevel.SECONDARY_SCHOOL,
  ебс: EducationLevel.SECONDARY_SCHOOL,
  мэргэжлийн: EducationLevel.VOCATIONAL,
  бакалавр: EducationLevel.BACHELOR,
  магистр: EducationLevel.MASTER,
  доктор: EducationLevel.PHD,
};

/** Регистрийн дугаар: two Cyrillic letters + eight digits (§4a). */
const REGISTER_RE = /^[А-ЯӨҮЁ]{2}\d{8}$/i;

interface Row {
  line: number;
  values: Record<string, string>;
}

interface Rejected {
  line: number;
  reason: string;
  raw: string;
}

async function main(): Promise<void> {
  const csv = readFileSync(resolve(filePath!), 'utf8');
  const records = parseCsv(csv);
  if (!records.length) {
    console.error('Файл хоосон эсвэл толгой мөр олдсонгүй');
    process.exit(1);
  }

  const rejected: Rejected[] = [];
  const ready: { row: Row; data: ClientImport }[] = [];
  const seenRegisters = new Set<string>();

  for (const row of records) {
    const parsed = toClient(row);
    if ('reason' in parsed) {
      rejected.push({ line: row.line, reason: parsed.reason, raw: JSON.stringify(row.values) });
      continue;
    }
    if (seenRegisters.has(parsed.registerNumber)) {
      rejected.push({ line: row.line, reason: 'Файл дотроо давхардсан регистр', raw: parsed.registerNumber });
      continue;
    }
    seenRegisters.add(parsed.registerNumber);
    ready.push({ row, data: parsed });
  }

  const existing = await prisma.client.findMany({
    where: { registerNumber: { in: [...seenRegisters] } },
    select: { registerNumber: true, code: true },
  });
  const existingByRegister = new Map(existing.map((client) => [client.registerNumber, client.code]));

  const toCreate = ready.filter(({ data }) => !existingByRegister.has(data.registerNumber));
  const skipped = ready.filter(({ data }) => existingByRegister.has(data.registerNumber));

  console.log(`\nУншсан мөр: ${records.length}`);
  console.log(`Шинээр бүртгэх: ${toCreate.length}`);
  console.log(`Аль хэдийн бүртгэлтэй (алгасна): ${skipped.length}`);
  console.log(`Алдаатай мөр: ${rejected.length}`);

  for (const item of rejected) {
    console.log(`  ✗ мөр ${item.line}: ${item.reason} — ${item.raw}`);
  }
  for (const { row, data } of skipped) {
    console.log(`  · мөр ${row.line}: ${data.registerNumber} → ${existingByRegister.get(data.registerNumber)}`);
  }

  if (!commit) {
    console.log('\nТуршилтын горим. Бодитоор бичихийн тулд --commit нэмнэ үү.\n');
    return;
  }

  let created = 0;
  for (const { row, data } of toCreate) {
    try {
      await prisma.$transaction(async (tx) => {
        const account = await tx.user.create({
          data: { name: `${data.lastName} ${data.firstName}`.trim(), email: data.email, phone: data.phone },
          select: { id: true },
        });
        await tx.client.create({
          data: {
            ...data,
            email: data.email ?? null,
            code: await generateCode(tx),
            userId: account.id,
          },
        });
      });
      created += 1;
    } catch (error) {
      console.log(`  ✗ мөр ${row.line}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${created} хэрэглэгч бүртгэгдлээ.\n`);
}

type ClientImport = {
  lastName: string;
  firstName: string;
  registerNumber: string;
  birthDate: Date;
  gender?: Gender;
  phone: string;
  phoneAlt?: string;
  email?: string;
  address?: string;
  educationLevel?: EducationLevel;
  schoolName?: string;
  note?: string;
};

function toClient(row: Row): ClientImport | { reason: string } {
  const get = (field: string) => row.values[field]?.trim() ?? '';

  const lastName = get('lastName');
  const firstName = get('firstName');
  const registerNumber = get('registerNumber').toUpperCase();
  const phone = normalisePhone(get('phone'));
  const birthDate = parseDate(get('birthDate'));

  if (!lastName || !firstName) return { reason: 'Овог эсвэл нэр хоосон' };
  if (!REGISTER_RE.test(registerNumber)) return { reason: `Регистрийн дугаар буруу: "${registerNumber}"` };
  if (!phone) return { reason: 'Утасны дугаар хоосон' };
  if (!birthDate) return { reason: `Төрсөн огноог уншиж чадсангүй: "${get('birthDate')}"` };

  return {
    lastName,
    firstName,
    registerNumber,
    birthDate,
    gender: GENDERS[get('gender').toLowerCase()],
    phone,
    phoneAlt: normalisePhone(get('phoneAlt')) || undefined,
    email: get('email').toLowerCase() || undefined,
    address: get('address') || undefined,
    educationLevel: EDUCATION[get('educationLevel').toLowerCase()],
    schoolName: get('schoolName') || undefined,
    note: get('note') || undefined,
  };
}

/** `KH-{year}-{seq}` — the same shape `ClientsService.generateCode` produces. */
async function generateCode(tx: Prisma.TransactionClient): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `KH-${year}-`;
  const last = await tx.client.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const next = last ? Number.parseInt(last.code.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Local phone numbers are stored as 8 digits (`normalizePhone`, 1A-15). */
function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.length > 8 ? digits.slice(-8) : digits;
}

/** Accepts `2004-05-17`, `2004.05.17`, `17/05/2004` and Excel's serial dates. */
function parseDate(input: string): Date | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  if (/^\d{4,5}$/.test(trimmed)) {
    // Excel serial: days since 1899-12-30 (its 1900 leap-year bug included).
    const serial = Number.parseInt(trimmed, 10);
    return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  }

  const iso = trimmed.replace(/[.]/g, '-');
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(iso)) {
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  return undefined;
}

/**
 * Minimal RFC-4180 reader: quoted fields, doubled quotes, embedded newlines.
 * A dependency-free parser is worth it here — the alternative is pulling a CSV
 * package into the API for one script that runs once.
 */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  // Strip a UTF-8 BOM — Excel writes one, and it would poison the first header.
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ',' || char === ';' || char === '\t') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field.replace(/\r$/, ''));
      rows.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || record.length) {
    record.push(field.replace(/\r$/, ''));
    rows.push(record);
  }

  const [headerRow, ...body] = rows.filter((row) => row.some((cell) => cell.trim()));
  if (!headerRow) return [];

  const fields = headerRow.map((header) => COLUMNS[header.trim().toLowerCase()] ?? '');

  return body.map((cells, offset) => {
    const values: Record<string, string> = {};
    for (const [index, field_] of fields.entries()) {
      if (field_) values[field_] = cells[index] ?? '';
    }
    return { line: offset + 2, values };
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
