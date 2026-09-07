import { InstructionLanguage, ProgramLevel } from '../../../prisma/client.js';

/**
 * The contract a Gemini programme reply must satisfy, and the guard that keeps
 * a bad one out of the review screen.
 *
 * Hand-written for the same reason as `intake-candidate.parser.ts`: the API's
 * validation layer is class-validator, and a second schema library for one
 * parser is not worth it. Three failures are caught here, because each one
 * reaches a client as a number they budget against:
 *
 *  - a plausible-looking price with no page behind it → `confidence` is
 *    required, and a candidate with no `sourceUrl` cannot claim HIGH;
 *  - a per-year figure reported as per-semester → both are bounds-checked, and
 *    an annual figure smaller than the semester one is dropped rather than
 *    quietly kept;
 *  - a college nobody publishes → `faculty` is free text and simply absent
 *    when the model did not read one, which lands the programme under "танхим
 *    тодорхойгүй" where somebody will look at it.
 *
 * Unknown values are dropped rather than defaulted, so a reviewer sees an empty
 * field, never a fabricated one.
 */

export type ProgramCandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ProgramCandidate {
  level: ProgramLevel;
  nameKo: string | null;
  nameEn: string | null;
  /** The college (단과대학) as the school writes it, or null when none was found. */
  faculty: string | null;
  durationYears: number | null;
  tuitionPerTermKrw: number | null;
  tuitionPerYearKrw: number | null;
  admissionFeeKrw: number | null;
  tuitionYear: number | null;
  scholarshipMaxPercent: number | null;
  scholarshipNote: string | null;
  topikLevel: number | null;
  language: InstructionLanguage;
  confidence: ProgramCandidateConfidence;
  sourceUrl: string | null;
  note: string | null;
}

export interface ProgramResearchResult {
  candidates: ProgramCandidate[];
  sources: string[];
}

export class ProgramResearchParseError extends Error {}

export interface ParseProgramOptions {
  /**
   * Whether Google's grounding trail came back with the reply — the one claim
   * in the exchange the model cannot author. An empty trail means every figure
   * is a recollection, however confidently it was labelled.
   */
  grounded?: boolean;
}

/** Said on every candidate of an ungrounded run, where the reviewer reads it. */
const UNGROUNDED_NOTE =
  'Google хайлт хийгдээгүй тул төлбөрийг загвар санамжаасаа бичсэн — сургуулийн хуудсан дээр заавал шалгана уу.';

const CONFIDENCES: ProgramCandidateConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
const LANGUAGES = Object.values(InstructionLanguage) as string[];
/** A university has departments in the dozens, not the hundreds. */
const MAX_CANDIDATES = 120;
const MAX_SOURCES = 30;
/** ₩50m a semester is already twice the most expensive Korean medical school. */
const MAX_TUITION_KRW = 50_000_000;

export function parseProgramResearchResult(
  payload: unknown,
  options: ParseProgramOptions,
): ProgramResearchResult {
  // Asked for the {candidates, sources} envelope, given the bare list often
  // enough to be a normal path rather than an error. A reply written as several
  // JSON documents arrives here as a list too (`extractJson`), so the same
  // branch folds those back together.
  const envelope = Array.isArray(payload) ? fold(payload) : payload;

  if (!isRecord(envelope)) throw new ProgramResearchParseError('Хариу объект биш байна.');
  if (!Array.isArray(envelope.candidates)) {
    throw new ProgramResearchParseError('Хариунд "candidates" жагсаалт алга байна.');
  }

  const candidates = envelope.candidates
    .slice(0, MAX_CANDIDATES)
    .map((entry) => parseCandidate(entry, options))
    .filter((entry): entry is ProgramCandidate => entry !== null);

  const sources = Array.isArray(envelope.sources)
    ? [...new Set(envelope.sources.filter(isHttpUrl))].slice(0, MAX_SOURCES)
    : [];

  return { candidates, sources };
}

/** Folds a list into one envelope — see `intake-candidate.parser.ts`. */
function fold(entries: unknown[]): { candidates: unknown[]; sources: unknown[] } {
  const candidates: unknown[] = [];
  const sources: unknown[] = [];

  for (const entry of entries) {
    if (Array.isArray(entry)) {
      candidates.push(...entry);
    } else if (isRecord(entry) && Array.isArray(entry.candidates)) {
      candidates.push(...entry.candidates);
      if (Array.isArray(entry.sources)) sources.push(...entry.sources);
    } else {
      candidates.push(entry);
    }
  }

  return { candidates, sources };
}

function parseCandidate(entry: unknown, options: ParseProgramOptions): ProgramCandidate | null {
  if (!isRecord(entry)) return null;

  const level = entry.level;
  if (typeof level !== 'string' || !(level in ProgramLevel)) return null;

  const nameKo = toText(entry.nameKo, 200);
  const nameEn = toText(entry.nameEn, 200);
  // A programme with no name at all cannot be reviewed, saved or deduplicated.
  if (!nameKo && !nameEn) return null;

  const grounded = options.grounded ?? true;
  const sourceUrl = isHttpUrl(entry.sourceUrl) ? entry.sourceUrl : null;

  const claimed = typeof entry.confidence === 'string' ? entry.confidence.toUpperCase() : '';
  let confidence: ProgramCandidateConfidence = CONFIDENCES.includes(claimed as ProgramCandidateConfidence)
    ? (claimed as ProgramCandidateConfidence)
    : 'LOW';
  // Confidence without a citation is an opinion. Say so.
  if (!sourceUrl && confidence !== 'LOW') confidence = 'MEDIUM';
  // Confidence without a search behind it is a memory. Say that louder.
  if (!grounded) confidence = 'LOW';

  const language =
    typeof entry.language === 'string' && LANGUAGES.includes(entry.language.toUpperCase())
      ? (entry.language.toUpperCase() as InstructionLanguage)
      : InstructionLanguage.KOREAN;

  const perTerm = toBoundedInt(entry.tuitionPerTermKrw, 1, MAX_TUITION_KRW);
  let perYear = toBoundedInt(entry.tuitionPerYearKrw, 1, MAX_TUITION_KRW * 3);
  // An "annual" figure below the semester one is the school's per-term number
  // written into the wrong box. Dropping it is safer than halving a client's
  // budget estimate; the per-term figure survives and the year is derived on
  // save, where a human can see it.
  if (perYear !== null && perTerm !== null && perYear < perTerm) perYear = null;

  const note = toText(entry.note, 1000);

  return {
    level: level as ProgramLevel,
    nameKo,
    nameEn,
    faculty: toText(entry.faculty, 200),
    durationYears: toBoundedFloat(entry.durationYears, 0.5, 10),
    tuitionPerTermKrw: perTerm,
    tuitionPerYearKrw: perYear,
    admissionFeeKrw: toBoundedInt(entry.admissionFeeKrw, 0, 10_000_000),
    tuitionYear: toBoundedInt(entry.tuitionYear, 2000, 2100),
    scholarshipMaxPercent: toBoundedInt(entry.scholarshipMaxPercent, 0, 100),
    scholarshipNote: toText(entry.scholarshipNote, 2000),
    topikLevel: toBoundedInt(entry.topikLevel, 1, 6),
    language,
    confidence,
    sourceUrl,
    note: grounded ? note : [UNGROUNDED_NOTE, note].filter(Boolean).join(' '),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  // Models write "4,200,000" and "4200000원" about as often as a bare integer.
  const cleaned = value.replace(/[,\s₩원]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoundedInt(value: unknown, min: number, max: number): number | null {
  const parsed = toNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  return rounded >= min && rounded <= max ? rounded : null;
}

function toBoundedFloat(value: unknown, min: number, max: number): number | null {
  const parsed = toNumber(value);
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
