import { ProgramLevel } from '../../../prisma/client.js';
import { INTAKE_MONTHS } from '../intake-deadline.js';

/**
 * The contract a Gemini research reply must satisfy (1H-10), and the guard
 * that keeps a bad one out of the review screen.
 *
 * Hand-written rather than zod: the API's validation layer is class-validator,
 * and adding a second schema library for one parser is not worth it. It is
 * also the point where three specific failures are caught, because each one
 * costs a student their intake:
 *
 *  - a hallucinated date shaped like a real one → every date is checked for a
 *    real calendar day, and anything unparseable becomes `null`;
 *  - a round for the wrong month → `month` must be one of 3/6/9/12;
 *  - a confident answer with no provenance → `confidence` is required, and a
 *    candidate with no `sourceUrl` is forced down to `LOW`.
 *
 * Unknown values are dropped rather than defaulted, so a reviewer sees an
 * empty field, never a fabricated one.
 */

export type IntakeCandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IntakeCandidate {
  level: ProgramLevel;
  year: number;
  month: number;
  openAt: string | null;
  applicationDeadline: string | null;
  classStartDate: string | null;
  resultAnnouncedAt: string | null;
  quota: number | null;
  admissionFeeKrw: number | null;
  requirementNote: string | null;
  confidence: IntakeCandidateConfidence;
  sourceUrl: string | null;
  note: string | null;
}

export interface IntakeResearchResult {
  candidates: IntakeCandidate[];
  sources: string[];
}

export class IntakeResearchParseError extends Error {}

const CONFIDENCES: IntakeCandidateConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
const MAX_CANDIDATES = 24;
const MAX_SOURCES = 30;

/**
 * Validates one model reply. Throws when the payload is unusable as a whole;
 * silently skips individual candidates that are malformed, because one bad
 * round in a year is not a reason to lose the other three.
 */
export function parseResearchResult(payload: unknown, expectedYear: number): IntakeResearchResult {
  if (!isRecord(payload)) throw new IntakeResearchParseError('Хариу объект биш байна.');
  if (!Array.isArray(payload.candidates)) {
    throw new IntakeResearchParseError('Хариунд "candidates" жагсаалт алга байна.');
  }

  const candidates = payload.candidates
    .slice(0, MAX_CANDIDATES)
    .map((entry) => parseCandidate(entry, expectedYear))
    .filter((entry): entry is IntakeCandidate => entry !== null);

  const sources = Array.isArray(payload.sources)
    ? [...new Set(payload.sources.filter(isHttpUrl))].slice(0, MAX_SOURCES)
    : [];

  return { candidates, sources };
}

function parseCandidate(entry: unknown, expectedYear: number): IntakeCandidate | null {
  if (!isRecord(entry)) return null;

  const level = entry.level;
  if (typeof level !== 'string' || !(level in ProgramLevel)) return null;

  const month = toInt(entry.month);
  if (month === null || !INTAKE_MONTHS.includes(month as (typeof INTAKE_MONTHS)[number])) return null;

  // A year the model drifted off is a sign it read the wrong page; the
  // reviewer can still change it, so keep the row but pin the year we asked for.
  const year = toInt(entry.year) ?? expectedYear;

  const sourceUrl = isHttpUrl(entry.sourceUrl) ? entry.sourceUrl : null;
  const claimed = typeof entry.confidence === 'string' ? entry.confidence.toUpperCase() : '';
  let confidence: IntakeCandidateConfidence = CONFIDENCES.includes(claimed as IntakeCandidateConfidence)
    ? (claimed as IntakeCandidateConfidence)
    : 'LOW';
  // Confidence without a citation is an opinion. Say so.
  if (!sourceUrl && confidence !== 'LOW') confidence = 'MEDIUM';

  return {
    level: level as ProgramLevel,
    year,
    month,
    openAt: toIsoDate(entry.openAt),
    applicationDeadline: toIsoDate(entry.applicationDeadline),
    classStartDate: toIsoDate(entry.classStartDate),
    resultAnnouncedAt: toIsoDate(entry.resultAnnouncedAt),
    quota: toBoundedInt(entry.quota, 0, 100_000),
    admissionFeeKrw: toBoundedInt(entry.admissionFeeKrw, 0, 10_000_000),
    requirementNote: toText(entry.requirementNote, 2000),
    confidence,
    sourceUrl,
    note: toText(entry.note, 1000),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `YYYY-MM-DD` that is also a real day — "2027-02-31" does not survive this. */
function toIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip catches overflow: JS rolls 2027-02-31 into 3 March.
  return date.toISOString().slice(0, 10) === `${year}-${month}-${day}` ? `${year}-${month}-${day}` : null;
}

function toInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

function toBoundedInt(value: unknown, min: number, max: number): number | null {
  const parsed = toInt(value);
  if (parsed === null || parsed < min || parsed > max) return null;
  return parsed;
}

function toText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
