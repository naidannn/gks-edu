import { z } from 'zod';
import { serviceTypeSchema } from './lead';
import type { AccreditationGrade, ProgramLevel } from '../types/university';

/**
 * The assistant's tool contract — 2B-06, `AI-ASSISTANT.md` §5.3.
 *
 * Two halves, and the second is the reason this file exists:
 *
 * - **Arguments** — what the model is allowed to ask for. Written here so the
 *   admin transcript viewer (2E-04) and the golden-question screen (2E-06) read
 *   a call the same way the server did.
 * - **Cards** — what a tool result looks like on screen. A card carries the
 *   figures straight from the database to the UI: the model never retypes a
 *   price or a deadline, so it cannot mistype one (§5.4). The widget (2C-03)
 *   renders these, and the shapes below are the whole agreement between the two.
 *
 * `apps/api` cannot import this package — it is raw TypeScript outside `src`
 * and `nest build` compiles `src` only, the same reason
 * `apps/api/src/modules/programs/tuition.ts` restates the tuition arithmetic. So
 * the API mirrors the argument shapes as JSON Schema in
 * `apps/api/src/modules/ai/chat/tools/`, and a field added here has to be added
 * there too.
 */

/** Every tool the assistant may be given. The registry gates them by level. */
export const AI_TOOL_NAMES = [
  'search_universities',
  'get_university',
  'search_programs',
  'get_intake_deadlines',
  'get_service_pricing',
  'get_fx_rate',
  'search_knowledge',
] as const;

export type AiToolName = (typeof AI_TOOL_NAMES)[number];

const programLevelSchema = z.enum(['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD']);

/* ── Arguments ─────────────────────────────────────────────────────────────── */

export const searchUniversitiesArgsSchema = z.object({
  query: z.string().max(120).optional(),
  /** `regionEn`, e.g. "Seoul" — the value the catalogue filters on. */
  region: z.string().max(60).optional(),
  level: programLevelSchema.optional(),
  gksEligible: z.boolean().optional(),
  languagePrep: z.boolean().optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

export const getUniversityArgsSchema = z.object({
  slug: z.string().min(1).max(120),
});

export const searchProgramsArgsSchema = z.object({
  keyword: z.string().max(120).optional(),
  level: programLevelSchema.optional(),
  universitySlug: z.string().max(120).optional(),
  region: z.string().max(60).optional(),
  /** A ceiling on the *annual* figure, because that is how a visitor thinks. */
  maxTuitionPerYearKrw: z.number().int().min(0).max(200_000_000).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

export const getIntakeDeadlinesArgsSchema = z.object({
  universitySlug: z.string().max(120).optional(),
  level: programLevelSchema.optional(),
  year: z.number().int().min(2020).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
  limit: z.number().int().min(1).max(8).optional(),
});

export const getServicePricingArgsSchema = z.object({
  serviceType: serviceTypeSchema,
});

export const getFxRateArgsSchema = z.object({});

export const searchKnowledgeArgsSchema = z.object({
  query: z.string().min(1).max(300),
  category: z
    .enum([
      'SCHOOL',
      'SERVICE',
      'PRICING',
      'SCHOLARSHIP',
      'DOCUMENTS',
      'VISA',
      'LIVING',
      'POLICY',
      'SALES',
      'FAQ',
    ])
    .optional(),
});

export const aiToolArgsSchemas = {
  search_universities: searchUniversitiesArgsSchema,
  get_university: getUniversityArgsSchema,
  search_programs: searchProgramsArgsSchema,
  get_intake_deadlines: getIntakeDeadlinesArgsSchema,
  get_service_pricing: getServicePricingArgsSchema,
  get_fx_rate: getFxRateArgsSchema,
  search_knowledge: searchKnowledgeArgsSchema,
} satisfies Record<AiToolName, z.ZodType>;

/* ── Cards ─────────────────────────────────────────────────────────────────── */

/** One school, as the chat shows it — the catalogue card, minus what is ours. */
export interface AiUniversityCard {
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string | null;
  cityMn: string | null;
  regionMn: string | null;
  logoPath: string | null;
  /** 교육국제화역량 인증제 tier — a visa signal, never a rank (CLAUDE.md). */
  accreditation: AccreditationGrade;
  /** THE South Korea Rank 2026. `null` = "рэйтингд ороогүй", never "worst". */
  theKoreaRank: number | null;
  isGksEligible: boolean;
  acceptsLanguagePrep: boolean;
}

/** One programme with its price. Per-term is what the school published. */
export interface AiProgramCard {
  id: string;
  nameMn: string;
  nameEn: string | null;
  level: ProgramLevel;
  university: { slug: string; nameMn: string; logoPath: string | null };
  facultyMn: string | null;
  tuitionPerTermKrw: number | null;
  /** Derived, never stored: per-term × terms in a year (`tuition.ts`). */
  tuitionPerYearKrw: number | null;
  /** How many terms that year has — 4 for a language institute, 2 for a degree. */
  termsPerYear: number;
  topikLevel: number | null;
  scholarshipMaxPercent: number | null;
  durationYears: number | null;
}

/**
 * A round that is still open to us, and how long is left.
 *
 * There is one deadline on this card and it is ours. The school's published
 * date is not carried here at all — not hidden, absent — because a payload that
 * holds both is one careless component away from showing the later one
 * (CLAUDE.md, `ARCHITECTURE.md` §3.2).
 */
export interface AiIntakeCard {
  id: string;
  university: { slug: string; nameMn: string; logoPath: string | null };
  level: ProgramLevel;
  year: number;
  month: number;
  /** Our internal deadline, ISO. The only deadline a client is ever shown. */
  internalDeadline: string | null;
  daysUntilInternalDeadline: number | null;
  classStartDate: string | null;
}

/** The current price of one service, for a caller who may see figures. */
export interface AiPricingCard {
  serviceType: z.infer<typeof serviceTypeSchema>;
  totalAmount: number;
  prepaymentAmount: number;
  /** When the rest falls due — after the visa, or after the GKS result (§9). */
  balanceTrigger: 'AFTER_VISA_APPROVED' | 'AFTER_SCHOLARSHIP_RESULT';
  balanceAmount: number;
}

export interface AiFxCard {
  /** MNT per 1 KRW. */
  rate: number;
  date: string;
  source: string;
}

export type AiChatCard =
  | { type: 'universities'; data: { items: AiUniversityCard[]; total: number; searchUrl: string } }
  | { type: 'university'; data: AiUniversityCard & { url: string } }
  | { type: 'programs'; data: { items: AiProgramCard[]; total: number; searchUrl: string } }
  | { type: 'intakes'; data: { items: AiIntakeCard[]; total: number } }
  | { type: 'pricing'; data: AiPricingCard }
  | { type: 'fx'; data: AiFxCard };

export type AiChatCardType = AiChatCard['type'];
