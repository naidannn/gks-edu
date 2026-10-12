import { Injectable } from '@nestjs/common';
import { AccessLevel, EducationLevel, ProgramLevel } from '../../../../prisma/client.js';
import { QueryStudyPlanDto } from '../../../study-plan/dto/query-study-plan.dto.js';
import { StudyPlanService } from '../../../study-plan/study-plan.service.js';
import { annualTuitionKrw } from '../../../programs/tuition.js';
import { readBoolean, readEnum, readInt, readString, requireEnum } from './args.js';
import type { AiTool, AiToolProvider, ToolOutcome } from './tool.types.js';

const LEVELS = Object.values(ProgramLevel);

/** Distinct schools named in one answer — three is a recommendation, six is a list. */
const SCHOOLS_NAMED = 3;

/** Region chips worth mentioning — the rest is the catalogue's job. */
const REGIONS_NAMED = 4;

const SITE = 'https://gksedu.mn';

/**
 * The diploma a person aiming at this level most likely holds.
 *
 * The planner wants both, but the person in a chat has said only what they want
 * — and asking "what did you graduate from?" before answering is exactly the
 * interrogation 2G-19 removes. A twelfth-grader aiming at a bachelor's and a
 * graduate aiming at a master's are the overwhelming cases; a model that knows
 * better passes `education` itself.
 */
const EDUCATION_FOR_GOAL: Record<ProgramLevel, EducationLevel> = {
  [ProgramLevel.LANGUAGE_PREP]: EducationLevel.SECONDARY_SCHOOL,
  [ProgramLevel.BACHELOR]: EducationLevel.SECONDARY_SCHOOL,
  [ProgramLevel.MASTER]: EducationLevel.BACHELOR,
  [ProgramLevel.PHD]: EducationLevel.MASTER,
};

const LEVEL_LABELS: Record<ProgramLevel, string> = {
  [ProgramLevel.LANGUAGE_PREP]: 'Хэлний бэлтгэл',
  [ProgramLevel.BACHELOR]: 'Бакалавр',
  [ProgramLevel.MASTER]: 'Магистр',
  [ProgramLevel.PHD]: 'Доктор',
};

type Plan = Awaited<ReturnType<StudyPlanService['build']>>;

/**
 * The study planner as one tool call (2G-19).
 *
 * Why it exists: the assistant used to walk a visitor through level → subject →
 * city → schools one question per turn, and then ask for a GPA and a budget on
 * top. In three days of production 182 of 935 answers asked for a GPA. The
 * people writing in mostly do not know which city, which school, or what a won
 * is in tögrög — so every question was a question they could not answer, and
 * they left before the recommendation arrived.
 *
 * `/plan` already answers "when, where, how much" from four taps, out of the
 * same intake calendar, catalogue, `ServicePricing` and exchange rate the site
 * shows. This tool hands that answer to the model with only the goal required
 * and every other input defaulted: no Korean, any subject, any city, no budget.
 *
 * The tögrög figures are converted and rounded here, never by the model. Policy
 * rule 1 forbids it from doing arithmetic, and the guard drops any ₮ amount it
 * cannot find in a source — so "18.2 сая₮" has to be written in the result
 * exactly as the model will say it.
 */
@Injectable()
export class StudyPlanTools implements AiToolProvider {
  constructor(private readonly plans: StudyPlanService) {}

  tools(): AiTool[] {
    return [this.buildStudyPlan()];
  }

  private buildStudyPlan(): AiTool {
    return {
      name: 'build_study_plan',
      minLevel: AccessLevel.PUBLIC,
      label: 'Танд тохирох төлөвлөгөө гаргаж байна…',
      description:
        '"Хэдэн төгрөг болох вэ", "зардал хэд", "надад аль сургууль тохирох вэ" гэх ерөнхий асуултын ' +
        'хариулт. Хэрэглэгчид тохирох бэлэн санал: хэзээ явах (зам, манай бүртгэлийн хугацаа), аль хот, ' +
        'аль 2–3 сургууль, эхний жилийн зардал төгрөгөөр (сургалт, амьжиргаа, үйлчилгээ). ' +
        'Зөвхөн `goal` заавал — бусдыг мэдэхгүй бол бүү дамжуул, хэрэгсэл өөрөө тооцно ' +
        '(солонгос хэлгүй, ямар ч чиглэл, ямар ч хот). Дүнг аль хэдийн төгрөгт хөрвүүлсэн.',
      parameters: {
        type: 'object',
        properties: {
          goal: { type: 'string', enum: LEVELS, description: 'Солонгост юу сурах вэ' },
          education: {
            type: 'string',
            enum: Object.values(EducationLevel),
            description: 'Одоогийн боловсрол — хэрэглэгч хэлсэн бол л',
          },
          topik: { type: 'integer', description: 'TOPIK түвшин, 0 = солонгос хэлгүй. Хэлээгүй бол бүү дамжуул' },
          field: { type: 'string', description: 'Сонирхсон чиглэлийн үг, жишээ нь "IT", "бизнес", "сувилахуй"' },
          region: { type: 'string', description: 'Бүсийн англи нэр, жишээ нь "Seoul", "Busan" — хэлсэн бол л' },
          maxTuitionPerYearMnt: {
            type: 'integer',
            description:
              'Жилийн сургалтын төлбөрийн дээд хязгаар, төгрөгөөр — хэрэглэгч өөрөө хэлсэн эсвэл төсвийн_сонголтоос сонгосон бол л. Өөрөө бүү зохио',
          },
          cheaper: {
            type: 'boolean',
            description: 'Хэрэглэгч "хямд хувилбар" гэж тоогүйгээр хүсвэл true — хязгаарыг хэрэгсэл өөрөө тогтооно',
          },
        },
        required: ['goal'],
      },
      run: async (args): Promise<ToolOutcome> => {
        const goal = requireEnum(args, 'goal', LEVELS);
        const education = readEnum(args, 'education', Object.values(EducationLevel)) ?? EDUCATION_FOR_GOAL[goal];
        const topik = readInt(args, 'topik', 0, 6) ?? 0;
        const field = readString(args, 'field', 80);
        const region = readString(args, 'region', 60);
        const cheaper = readBoolean(args, 'cheaper') ?? false;

        const base = Object.assign(new QueryStudyPlanDto(), { education, goal, topik, field, region });
        // The unconstrained plan comes first, always: it carries the exchange
        // rate the tögrög ceiling is converted at, and the price range the
        // budget choices are cut from. Those choices are offered on every
        // answer — including one that already applied a ceiling — so a visitor
        // who picked too low a figure is offered the others in figures the
        // guard can find in this very result.
        const open = await this.plans.build(base, { schoolsShown: SCHOOLS_NAMED });
        const choices = budgetChoices(open);
        // "Хямд хувилбар" with no figure: the model picked 20 сая₮ out of the
        // air in testing and got no schools at all. The lower choice is a
        // ceiling the catalogue is known to have something under.
        const budgetMnt = readInt(args, 'maxTuitionPerYearMnt', 0, 2_000_000_000) ?? (cheaper ? choices[0] : undefined);

        const plan = budgetMnt
          ? await this.plans.build(
              Object.assign(new QueryStudyPlanDto(), { ...base, budget: Math.floor(budgetMnt / open.cost.krwToMnt) }),
              { schoolsShown: SCHOOLS_NAMED },
            )
          : open;

        return {
          title: 'Суралцах төлөвлөгөө',
          data: forModel(plan, budgetMnt ?? null, choices),
          card: { type: 'study_plan', data: planCard(plan) },
        };
      },
    };
  }
}

/* ── What the model reads ─────────────────────────────────────────────────── */

function forModel(plan: Plan, budgetMnt: number | null, choices: number[]) {
  const rate = plan.cost.krwToMnt;
  const needsPrep = plan.schools.gate === 'AFTER_PREP';
  const goal = plan.input.goal;

  return {
    тооцсон_нөхцөл: [
      LEVEL_LABELS[goal],
      plan.input.topik > 0 ? `TOPIK ${plan.input.topik}` : 'солонгос хэлгүй',
      plan.input.field ? `чиглэл: ${plan.input.field}` : 'чиглэл сонгоогүй',
      plan.input.region ? `бүс: ${plan.input.region}` : 'хот сонгоогүй',
      budgetMnt ? `сургалтын төлбөр жилд ${sayMnt(budgetMnt)}-өөс хэтрэхгүй` : null,
    ]
      .filter(Boolean)
      .join(', '),
    зам: plan.stages.map((stage) => ({
      шат: stage.titleMn,
      эхлэх: `${stage.start.year} оны ${stage.start.month}-р сар`,
      хугацаа_сар: stage.durationMonths,
      манай_бүртгэлийн_эцсийн_хугацаа: stage.start.registerBy?.slice(0, 10) ?? null,
      үлдсэн_өдөр: stage.start.daysToRegister,
      огноо: stage.start.source === 'REAL' ? 'нийтлэгдсэн элсэлтээс' : 'хичээлийн хуанлиас тооцсон, баталгаат биш',
      яагаад: stage.reasonMn,
    })),
    сургуулиуд_гэж_юу: needsPrep
      ? 'Хэлний бэлтгэлийн дараа элсэх боломжтой ангиуд (бидний зөвлөх дарааллаар)'
      : 'Одоо шууд мэдүүлж болох ангиуд (бидний зөвлөх дарааллаар)',
    сургуулиуд: distinctSchools(plan).map((program) => {
      const krw = annualTuitionKrw(program);
      return {
        сургууль: program.university.nameMn,
        хот: program.university.cityMn ?? program.university.regionMn,
        анги: program.nameMn,
        жилийн_сургалтын_төлбөр: krw === null ? 'мэдээлэл шинэчлэгдэж байна' : `${sayKrw(krw)} ≈ ${sayMnt(krw * rate)}`,
        topik: program.topikLevel,
      };
    }),
    тохирох_анги_нийт: plan.schools.total,
    хотоор: plan.schools.regions.slice(0, REGIONS_NAMED).map((row) => ({ бүс: row.label, region: row.value, анги: row.count })),
    эхний_жилийн_зардал: {
      юуны_зардал: needsPrep ? 'Эхний жил = хэлний бэлтгэлийн жил' : `Эхний жил = ${LEVEL_LABELS[goal]}-ын эхний жил`,
      мөрүүд: plan.cost.items
        .filter((item) => item.minMnt !== null || item.maxMnt !== null)
        .map((item) => ({
          нэр: item.labelMn,
          дүн: sayRange(item.minMnt, item.maxMnt),
          ...(item.minKrw !== null ? { вон: sayKrwRange(item.minKrw, item.maxKrw) } : {}),
          ...(item.noteMn ? { тайлбар: item.noteMn } : {}),
          ...(item.isEstimate ? { ойролцоо: true } : {}),
        })),
      нийт: sayRange(plan.cost.totalMinMnt, plan.cost.totalMaxMnt),
    },
    ...(plan.cost.nextStage && plan.cost.nextStage.minKrw !== null
      ? {
          дараагийн_шатны_сургалтын_төлбөр: `${plan.cost.nextStage.titleMn}: жилд ${sayRange(
            plan.cost.nextStage.minKrw * rate,
            (plan.cost.nextStage.maxKrw ?? plan.cost.nextStage.minKrw) * rate,
          )}`,
        }
      : {}),
    төсвийн_сонголт: choices.map((value) => `${sayMnt(value)} хүртэл`),
    ...(budgetMnt && plan.schools.total === 0
      ? { анхаар: 'Энэ төсөвт тохирох анги олдсонгүй — төсвийн_сонголтоос өндрийг санал болго' }
      : {}),
    ханш: `₩1 = ${rate.toFixed(2)}₮ (${plan.cost.fxDate.slice(0, 10)})`,
    бүтэн_төлөвлөгөө: `${SITE}${planPath(plan, budgetMnt)}`,
  };
}

/**
 * The first programme of each school, in the planner's order — which is the
 * catalogue's recommendation order. Six programmes are often three schools'
 * two departments each; naming one school twice is a list, not a choice.
 */
function distinctSchools(plan: Plan) {
  const seen = new Set<string>();
  return plan.schools.items
    .filter((program) => {
      if (seen.has(program.university.slug)) return false;
      seen.add(program.university.slug);
      return true;
    })
    .slice(0, SCHOOLS_NAMED);
}

/**
 * Two tuition ceilings to offer as the budget question, from this plan's own
 * price range — a third and two thirds of the way up, rounded.
 *
 * The question is only worth asking with real numbers in it ("12 сая₮ хүртэл"),
 * and the model may not invent one: the guard drops a sentence holding a ₮
 * amount it cannot find in a source. So the choices are figures this result
 * states, and the one picked comes back as `maxTuitionPerYearMnt`. They are on
 * the degree's price when the schools shown are the ones after language prep,
 * because that is what the ceiling filters.
 */
function budgetChoices(plan: Plan): number[] {
  const rate = plan.cost.krwToMnt;
  const tuition = plan.cost.items.find((item) => item.key === 'TUITION');
  const min = plan.cost.nextStage?.minKrw != null ? plan.cost.nextStage.minKrw * rate : tuition?.minMnt ?? null;
  const max = plan.cost.nextStage?.maxKrw != null ? plan.cost.nextStage.maxKrw * rate : tuition?.maxMnt ?? null;
  if (min === null || max === null || max - min < 2_000_000) return [];

  const round = (value: number) =>
    value >= 10_000_000 ? Math.round(value / 1_000_000) * 1_000_000 : Math.round(value / 500_000) * 500_000;
  const choices = [round(min + (max - min) / 3), round(min + ((max - min) * 2) / 3)];
  return [...new Set(choices)].filter((value) => value > min);
}

/* ── What the widget draws ────────────────────────────────────────────────── */

/** `AiStudyPlanCard` in the shared package. */
function planCard(plan: Plan) {
  const rate = plan.cost.krwToMnt;
  const first = plan.stages[0];

  return {
    goal: plan.input.goal,
    stages: plan.stages.map((stage) => ({
      titleMn: stage.titleMn,
      year: stage.start.year,
      month: stage.start.month,
      durationMonths: stage.durationMonths,
      estimated: stage.start.source !== 'REAL',
    })),
    registerBy: first?.start.registerBy ?? null,
    daysToRegister: first?.start.daysToRegister ?? null,
    schoolsAfterPrep: plan.schools.gate === 'AFTER_PREP',
    schools: distinctSchools(plan).map((program) => {
      const krw = annualTuitionKrw(program);
      return {
        slug: program.university.slug,
        nameMn: program.university.nameMn,
        cityMn: program.university.cityMn ?? program.university.regionMn,
        logoPath: program.university.logoPath,
        programMn: program.nameMn,
        tuitionPerYearKrw: krw,
        tuitionPerYearMnt: krw === null ? null : Math.round(krw * rate),
      };
    }),
    total: plan.schools.total,
    firstYearMinMnt: plan.cost.totalMinMnt,
    firstYearMaxMnt: plan.cost.totalMaxMnt,
    krwToMnt: rate,
    planUrl: planPath(plan, null),
  };
}

/** `/plan` with the same answers, so "see the whole plan" opens this one. */
function planPath(plan: Plan, budgetMnt: number | null): string {
  const query = new URLSearchParams({
    education: plan.input.education ?? '',
    goal: plan.input.goal,
    topik: String(plan.input.topik),
    field: plan.input.field ?? 'any',
  });
  if (plan.input.region) query.set('region', plan.input.region);
  if (plan.input.budgetKrw !== null && budgetMnt) query.set('budget', String(plan.input.budgetKrw));
  return `/plan?${query.toString()}`;
}

/* ── Figures, written the way they will be said ───────────────────────────── */

/**
 * `24 сая₮`, `6.4 сая₮`, `700 мянган₮` — rounded to what a family budgets in,
 * and in the exact spelling the guard parses back (`guard.service.ts`,
 * `amountValue`). Whole millions from ten up, the same rule as the web's
 * `formatMntMillions`, so the sentence and the card beside it agree.
 */
export function sayMnt(value: number): string {
  if (value >= 10_000_000) return `${Math.round(value / 1_000_000)} сая₮`;
  if (value >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))} сая₮`;
  return `${Math.round(value / 1_000)} мянган₮`;
}

function sayRange(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const low = sayMnt((min ?? max) as number);
  const high = sayMnt((max ?? min) as number);
  return low === high ? low : `${low} – ${high}`;
}

function sayKrw(value: number): string {
  return `₩${value.toLocaleString('en-US')}`;
}

function sayKrwRange(min: number, max: number | null): string {
  return max === null || max === min ? sayKrw(min) : `${sayKrw(min)} – ${sayKrw(max)}`;
}

function trimZero(value: string): string {
  return value.endsWith('.0') ? value.slice(0, -2) : value;
}
