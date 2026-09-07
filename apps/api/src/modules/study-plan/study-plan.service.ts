import { Injectable } from '@nestjs/common';
import { InstructionLanguage, Prisma, ProgramLevel, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import { FxService } from '../fx/fx.service.js';
import { PricingService } from '../pricing/pricing.service.js';
import { PROGRAM_CARD_FIELDS } from '../programs/programs.service.js';
import { programSearchWhere } from '../programs/programs.service.js';
import type { QueryStudyPlanDto } from './dto/query-study-plan.dto.js';
import {
  FALLBACK_TOPIK_REQUIREMENT,
  SERVICE_FOR_LEVEL,
  addMonths,
  calendarIntakes,
  daysUntil,
  isGoalReachable,
  needsLanguageStage,
  prepMonths,
  sumRange,
} from './study-plan.rules.js';

/** How many schools the answer opens with. Short on purpose — the plan is a
 *  first answer, and the catalogue is one tap away for the rest. */
const SCHOOLS_SHOWN = 6;

/** The wizard's "хараахан шийдээгүй" — an answer, not an absent one. */
const ANY_FIELD = 'any';

const LEVEL_LABELS: Record<ProgramLevel, string> = {
  [ProgramLevel.LANGUAGE_PREP]: 'Хэлний бэлтгэл',
  [ProgramLevel.BACHELOR]: 'Бакалавр',
  [ProgramLevel.MASTER]: 'Магистр',
  [ProgramLevel.PHD]: 'Доктор',
};

const MONTHS_PER_YEAR = 12;

/** The shape `University.livingCost` is stored in — a regional estimate. */
interface LivingCostJson {
  tierLabelMn?: string;
  monthlyTotalMin?: number | null;
  monthlyTotalMax?: number | null;
}

/**
 * Суралцах төлөвлөгөө — the study planner (ARCHITECTURE.md §3.4).
 *
 * Four taps in, this answers the three questions every first consultation
 * starts with: **when** could I be in Korea, **where** could I study, and
 * **how much** does the first year cost. None of it is new data — it is the
 * intake calendar, the programme catalogue, `ServicePricing` and the regional
 * living-cost estimates, read together for one person instead of browsed.
 *
 * Two inherited rules are load-bearing:
 *
 *   - The only deadline this service emits is `internalDeadline`, ours. That is
 *     `AdmissionsService.earliestOpenMonth`'s job, and the reason the query
 *     lives there rather than here.
 *   - Nothing is invented. A month with no published round is answered from the
 *     academic calendar and *labelled* `ESTIMATED`; an unknown price stays
 *     `null` and the card says so rather than showing a confident zero.
 */
@Injectable()
export class StudyPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admissions: AdmissionsService,
    private readonly pricing: PricingService,
    private readonly fx: FxService,
  ) {}

  async build(query: QueryStudyPlanDto) {
    const now = new Date();

    // A goal the visitor's diploma cannot reach is not an error to throw at
    // them — the wizard only offers reachable ones, and a hand-edited link
    // simply gets planned as language prep, which is where that person starts.
    const goal = isGoalReachable(query.education, query.goal) ? query.goal : ProgramLevel.LANGUAGE_PREP;
    const topik = Math.min(Math.max(query.topik ?? 0, 0), 6);
    // `any` is what the wizard's "хараахан шийдээгүй" writes into the URL, and
    // it has to mean the same thing here as it does there: no subject at all,
    // rather than a search for the literal word "any".
    const rawField = query.field?.trim() || null;
    const field = rawField === ANY_FIELD ? null : rawField;
    const region = query.region?.trim() || null;
    const budgetKrw = query.budget ?? null;

    const goalWhere = this.programWhere({ level: goal, field, region, budgetKrw });
    // The language gate is decided on the four questions the visitor answered,
    // never on the region and budget chips — see `needsLanguageStage`.
    const gateWhere = this.programWhere({ level: goal, field });

    // Round one settles the one branch the rest of the plan hangs off: is the
    // language stage in the path or not?
    const [gateDirect, gateTotal, requiredTopik] = await Promise.all([
      this.prisma.universityProgram.count({ where: this.withTopikGate(gateWhere, topik) }),
      this.prisma.universityProgram.count({ where: gateWhere }),
      this.minTopikRequired(gateWhere),
    ]);

    const needsPrep = needsLanguageStage(goal, gateDirect, gateTotal);
    const targetTopik = requiredTopik ?? FALLBACK_TOPIK_REQUIREMENT[goal];
    // After prep the door that opens is the easiest one in the catalogue, so
    // the schools shown are the ones asking no more than that.
    const schoolsWhere = needsPrep ? this.withTopikGate(goalWhere, targetTopik) : this.withTopikGate(goalWhere, topik);

    // What the first year in Korea actually costs is the *first* stage's cost:
    // for somebody who needs Korean first, that is a language institute, not
    // the degree they are aiming at.
    const firstLevel = needsPrep ? ProgramLevel.LANGUAGE_PREP : goal;
    const costWhere = needsPrep ? this.programWhere({ level: ProgramLevel.LANGUAGE_PREP, region }) : schoolsWhere;

    // The region chips are counted with the region filter lifted, for the same
    // reason the catalogue's facets are: the number a visitor wants next to
    // "Пусан" is how many Пусан has, and counting them through the current
    // region leaves exactly one chip — the one already selected — with no way
    // back to the others.
    const regionWhere = this.withTopikGate(
      this.programWhere({ level: goal, field, budgetKrw }),
      needsPrep ? targetTopik : topik,
    );

    const [items, total, regions, costPrices, goalPrices, living, unlocked, firstMonth, pricing, fxRate] =
      await Promise.all([
        this.prisma.universityProgram.findMany({
          where: schoolsWhere,
          select: PROGRAM_CARD_FIELDS,
          // Our own recommendation order, exactly as the catalogue opens
          // (ARCHITECTURE.md §3.1) — `gksRank` orders the plan and never shows in it.
          orderBy: [{ university: { gksRank: 'asc' } }, { university: { nameMn: 'asc' } }],
          take: SCHOOLS_SHOWN,
        }),
        this.prisma.universityProgram.count({ where: schoolsWhere }),
        this.regionCounts(regionWhere),
        this.priceRange(costWhere),
        needsPrep ? this.priceRange(schoolsWhere) : Promise.resolve(null),
        this.livingCostRange(schoolsWhere, region),
        topik < 6 && !needsPrep
          ? this.prisma.universityProgram.count({ where: this.withTopikGate(goalWhere, topik + 1) })
          : Promise.resolve(null),
        this.admissions.earliestOpenMonth(firstLevel, { region }),
        this.pricing.publicPricing(),
        this.fx.current(),
      ]);

    const serviceType = SERVICE_FOR_LEVEL[goal];
    // Nothing at this level in the catalogue at all is a third state, and it
    // must not be worded as either of the other two: with no programmes to
    // qualify for, "you already qualify" is a claim we cannot make.
    const catalogueEmpty = gateTotal === 0;
    const stages = this.buildStages({ goal, topik, targetTopik, needsPrep, catalogueEmpty, firstMonth, now });
    const departure = stages[0]?.start ?? null;

    const cost = this.buildCost({
      serviceType,
      pricing,
      krwToMnt: fxRate.rate,
      fxDate: fxRate.date,
      prices: costPrices,
      living,
      nextStage:
        needsPrep && goalPrices
          ? { titleMn: LEVEL_LABELS[goal], minKrw: goalPrices.tuitionMin, maxKrw: goalPrices.tuitionMax }
          : null,
    });

    return {
      input: { education: query.education, goal, topik, field, region, budgetKrw },
      serviceType,
      departure,
      stages,
      timeline: this.buildTimeline(stages),
      requirements: this.buildRequirements({ goal, topik, targetTopik, needsPrep, catalogueEmpty, total, budgetKrw }),
      schools: {
        gate: needsPrep ? ('AFTER_PREP' as const) : ('NOW' as const),
        total,
        items,
        regions,
        // Measured against what is on screen, because that is what the number
        // promises to add to. When prep is in the path there is nothing to
        // unlock — the whole list is already gated behind it.
        unlockedByNextTopik:
          unlocked !== null && unlocked > total ? { topik: topik + 1, count: unlocked - total } : null,
      },
      cost,
      consultationNote: this.buildNote({ goal, topik, fieldName: field, regions, region, stages, matchCount: total }),
    };
  }

  /* --------------------------------------------------------------------- *
   * Matching
   * --------------------------------------------------------------------- */

  /**
   * The catalogue filter behind every count on the plan.
   *
   * Deliberately the same shape as the public programme search: a plan that
   * promises a school the catalogue would not list is a plan that falls apart
   * on the next click. `acceptsFromMongolia` is the one condition the
   * catalogue does not apply — here the applicant is known to be Mongolian.
   */
  private programWhere(options: {
    level: ProgramLevel;
    field?: string | null;
    region?: string | null;
    budgetKrw?: number | null;
  }): Prisma.UniversityProgramWhereInput {
    const { level, field, region, budgetKrw } = options;
    return {
      isPublished: true,
      acceptsInternational: true,
      level,
      // The keyword the visitor typed, matched exactly the way `/programs`
      // matches it — a plan that counts programmes the catalogue would not
      // list is a plan that falls apart on the next click.
      ...(field ? { AND: [programSearchWhere(field)] } : {}),
      // Same rule as `/programs`: a budget filter is about published prices, so
      // a programme with no figure is out of a budgeted list rather than
      // silently counted as affordable.
      ...(budgetKrw !== null && budgetKrw !== undefined ? { tuitionPerYearKrw: { lte: budgetKrw } } : {}),
      university: {
        isPublished: true,
        acceptsFromMongolia: true,
        ...(region ? { regionEn: region } : {}),
      },
    };
  }

  /**
   * Narrow a match set to what somebody with this much Korean can enter.
   *
   * Three doors count as open, and the third is the one people miss: a
   * programme taught in English asks for no TOPIK at all. A programme that
   * publishes no requirement is not thereby demanding one either — it stays in,
   * and the card shows the requirement as unknown.
   */
  private withTopikGate(
    where: Prisma.UniversityProgramWhereInput,
    topik: number,
  ): Prisma.UniversityProgramWhereInput {
    // `AND`-ed for the same reason `priceRange` is: two conditions on one field,
    // or two `OR`s in one object, quietly become one.
    return {
      AND: [
        where,
        {
          OR: [
            { topikLevel: { lte: topik } },
            { topikLevel: null },
            { language: InstructionLanguage.ENGLISH },
          ],
        },
      ],
    };
  }

  /** The easiest Korean-taught door in this match set — the target of the language stage. */
  private async minTopikRequired(where: Prisma.UniversityProgramWhereInput): Promise<number | null> {
    const result = await this.prisma.universityProgram.aggregate({
      where: {
        AND: [where, { topikLevel: { not: null }, language: { not: InstructionLanguage.ENGLISH } }],
      },
      _min: { topikLevel: true },
    });
    return result._min.topikLevel;
  }

  /**
   * Region counts for the chips on the result — the "хот солих" control the
   * whole answer re-runs on.
   *
   * Regions cannot be grouped through the relation, so the per-school counts
   * are rolled up here, the same way `ProgramsService.facets` does it.
   */
  private async regionCounts(where: Prisma.UniversityProgramWhereInput) {
    const byUniversity = await this.prisma.universityProgram.groupBy({
      by: ['universityId'],
      where,
      _count: { _all: true },
    });
    if (!byUniversity.length) return [];

    const universities = await this.prisma.university.findMany({
      where: { id: { in: byUniversity.map((row) => row.universityId) } },
      select: { id: true, regionEn: true, regionMn: true },
    });

    const regionOf = new Map(universities.map((row) => [row.id, row]));
    const regions = new Map<string, { value: string; label: string; count: number }>();
    for (const row of byUniversity) {
      const university = regionOf.get(row.universityId);
      if (!university) continue;
      const entry = regions.get(university.regionEn) ?? {
        value: university.regionEn,
        label: university.regionMn,
        count: 0,
      };
      entry.count += row._count._all;
      regions.set(university.regionEn, entry);
    }
    return [...regions.values()].sort((a, b) => b.count - a.count);
  }

  /**
   * Published tuition and 입학금 across a match set. Nulls stay null.
   *
   * The extra condition is `AND`-ed rather than spread in: a budget filter is
   * itself a `tuitionPerYearKrw` condition, and spreading a second one over it
   * silently drops the ceiling — which is how a list showing no schools ends up
   * quoting a price from the ones it excluded.
   */
  private async priceRange(where: Prisma.UniversityProgramWhereInput) {
    const [tuition, fee] = await Promise.all([
      this.prisma.universityProgram.aggregate({
        where: { AND: [where, { tuitionPerYearKrw: { not: null } }] },
        _min: { tuitionPerYearKrw: true },
        _max: { tuitionPerYearKrw: true },
      }),
      this.prisma.universityProgram.aggregate({
        where: { AND: [where, { admissionFeeKrw: { not: null } }] },
        _min: { admissionFeeKrw: true },
        _max: { admissionFeeKrw: true },
      }),
    ]);

    return {
      tuitionMin: tuition._min.tuitionPerYearKrw,
      tuitionMax: tuition._max.tuitionPerYearKrw,
      feeMin: fee._min.admissionFeeKrw,
      feeMax: fee._max.admissionFeeKrw,
    };
  }

  /**
   * Monthly living cost across the schools this plan actually points at.
   *
   * Read off the *shown* schools rather than off the stage being priced, and
   * that is the interesting decision: told nothing about where they want to
   * live, a visitor would otherwise get the spread from a rural campus to
   * Gangnam, which is a range so wide it answers nothing. The schools on the
   * card are the cities this person would actually be living in, so the figure
   * narrows the moment they tap a region chip — which is the question
   * "Сөүлд амьдрахад хэд их үнэтэй вэ?" being asked and answered.
   */
  private async livingCostRange(where: Prisma.UniversityProgramWhereInput, region: string | null) {
    // Narrowed to the schools on the card, and widened back to the region when
    // the chips filtered every one of them away — a cost card that goes blank
    // because a budget filter matched nothing answers the wrong question.
    const scoped = { isPublished: true, ...(region ? { regionEn: region } : {}) };
    let universities = await this.prisma.university.findMany({
      where: { ...scoped, programs: { some: where } },
      select: { livingCost: true },
    });
    if (!universities.length) {
      universities = await this.prisma.university.findMany({ where: scoped, select: { livingCost: true } });
    }

    let min: number | null = null;
    let max: number | null = null;
    const tiers = new Set<string>();

    for (const row of universities) {
      const cost = row.livingCost as LivingCostJson | null;
      if (!cost) continue;
      if (cost.tierLabelMn) tiers.add(cost.tierLabelMn);
      if (typeof cost.monthlyTotalMin === 'number') min = min === null ? cost.monthlyTotalMin : Math.min(min, cost.monthlyTotalMin);
      if (typeof cost.monthlyTotalMax === 'number') max = max === null ? cost.monthlyTotalMax : Math.max(max, cost.monthlyTotalMax);
    }

    return { monthlyMin: min, monthlyMax: max, tiers: [...tiers] };
  }

  /* --------------------------------------------------------------------- *
   * The path
   * --------------------------------------------------------------------- */

  /**
   * One stage, or two when Korean has to come first.
   *
   * The second stage is always estimated: no school has published a round two
   * years out, and pretending otherwise would put a fake deadline on the most
   * important date in the plan.
   */
  private buildStages(options: {
    goal: ProgramLevel;
    topik: number;
    targetTopik: number;
    needsPrep: boolean;
    /** No programme at the goal level is published yet — see `build`. */
    catalogueEmpty: boolean;
    firstMonth: Awaited<ReturnType<AdmissionsService['earliestOpenMonth']>>;
    now: Date;
  }) {
    const { goal, topik, targetTopik, needsPrep, catalogueEmpty, firstMonth, now } = options;

    const firstLevel = needsPrep ? ProgramLevel.LANGUAGE_PREP : goal;
    const start = this.toIntake(firstMonth, firstLevel, now, null);
    if (!start) return [];

    const firstStage = {
      kind: needsPrep ? ('LANGUAGE_PREP' as const) : ('DEGREE' as const),
      level: firstLevel,
      titleMn: needsPrep ? 'Хэлний бэлтгэл' : LEVEL_LABELS[goal],
      reasonMn: needsPrep
        ? `Мэргэжлийн ангид элсэхэд дор хаяж TOPIK ${targetTopik} шаардлагатай тул эхлээд хэлний бэлтгэлд суралцана.`
        : catalogueEmpty
          ? 'Энэ түвшний ангиудын мэдээлэл шинэчлэгдэж байна. Огноо, зардлын тооцоо хүчинтэй — сургууль сонголтыг зөвлөхтэй хамт тодруулна.'
          : 'Одоогийн боловсрол, хэлний түвшинд тохирох ангиуд байгаа тул шууд мэдүүлж болно.',
      durationMonths: needsPrep ? prepMonths(topik, targetTopik) : null,
      start,
    };

    if (!needsPrep) return [firstStage];

    // The degree can only start at a term that begins after the language
    // course ends, so the calendar is asked for the first one past that point.
    const prepEnds = addMonths(
      start.classStartDate ? new Date(start.classStartDate) : new Date(Date.UTC(start.year, start.month - 1, 1, 12)),
      firstStage.durationMonths ?? 0,
    );
    const [next] = calendarIntakes(goal, now, { count: 1, notBefore: prepEnds });
    if (!next) return [firstStage];

    return [
      firstStage,
      {
        kind: 'DEGREE' as const,
        level: goal,
        titleMn: LEVEL_LABELS[goal],
        reasonMn: `TOPIK ${targetTopik} авсны дараа мэргэжлийн ангид шилжинэ.`,
        durationMonths: null,
        start: {
          year: next.year,
          month: next.month,
          registerBy: next.registerBy.toISOString(),
          daysToRegister: daysUntil(next.registerBy, now),
          classStartDate: next.classStart.toISOString(),
          intakeCount: 0,
          source: 'ESTIMATED' as const,
        },
      },
    ];
  }

  /**
   * A published month when the calendar has one, the academic calendar when it
   * does not — and the payload always says which, because one is a date
   * somebody can miss and the other is guidance.
   */
  private toIntake(
    month: Awaited<ReturnType<AdmissionsService['earliestOpenMonth']>>,
    level: ProgramLevel,
    now: Date,
    notBefore: Date | null,
  ) {
    if (month) {
      return {
        year: month.year,
        month: month.month,
        registerBy: month.registerBy?.toISOString() ?? null,
        daysToRegister: daysUntil(month.registerBy, now),
        classStartDate: month.classStartDate?.toISOString() ?? null,
        intakeCount: month.intakeCount,
        source: 'REAL' as const,
      };
    }

    const [fallback] = calendarIntakes(level, now, { count: 1, notBefore: notBefore ?? undefined });
    if (!fallback) return null;

    return {
      year: fallback.year,
      month: fallback.month,
      registerBy: fallback.registerBy.toISOString(),
      daysToRegister: daysUntil(fallback.registerBy, now),
      classStartDate: fallback.classStart.toISOString(),
      intakeCount: 0,
      source: 'ESTIMATED' as const,
    };
  }

  /**
   * The six steps between today and the plane, hung off the two dates we
   * actually know. The rest carry their timing in words rather than in an
   * invented date — a made-up visa date is the one a family plans a job
   * resignation around.
   */
  private buildTimeline(stages: ReturnType<StudyPlanService['buildStages']>) {
    const first = stages[0];
    const last = stages[stages.length - 1];
    // A second stage two years out comes from the academic calendar, so its
    // "class start" is a month we inferred, not the 1st of September. Printing
    // the day would dress an estimate up as a booking.
    const departureIsDated = last?.start.source === 'REAL';

    return [
      {
        key: 'REGISTER' as const,
        titleMn: 'Бүртгэл',
        textMn: 'Гэрээ байгуулж, урьдчилгаа төлбөрөө төлнө.',
        date: first?.start.registerBy ?? null,
      },
      {
        key: 'DOCUMENTS' as const,
        titleMn: 'Материал бүрдүүлэх',
        textMn: 'Диплом, дүнгийн тодорхойлолт, санхүүгийн баримтаа орчуулж, баталгаажуулна.',
        date: first?.start.registerBy ?? null,
      },
      {
        key: 'APPLY' as const,
        titleMn: 'Сургуульд мэдүүлэх',
        textMn: 'Бид материалыг сургууль руу илгээж, хариуг хүлээнэ.',
        date: null,
      },
      {
        key: 'INVITATION' as const,
        titleMn: 'Урилга',
        textMn: 'Элссэн бол сургалтын төлбөрөө төлж, албан урилгаа авна.',
        date: null,
      },
      {
        key: 'VISA' as const,
        titleMn: 'Виз',
        textMn: 'Урилгатайгаар элчин сайдын яаманд визээ мэдүүлнэ.',
        date: null,
      },
      {
        key: 'DEPARTURE' as const,
        titleMn: 'Солонгос явах',
        textMn: departureIsDated
          ? 'Хичээл эхлэхээс өмнө очиж, байрандаа орно.'
          : `${last?.start.year} оны ${last?.start.month}-р сард хичээл эхэлнэ. Очих өдрөө урьдчилан тохирно.`,
        date: departureIsDated ? (last?.start.classStartDate ?? null) : null,
      },
    ];
  }

  /** What stands between this person and the plan, checked against their answers. */
  private buildRequirements(options: {
    goal: ProgramLevel;
    topik: number;
    targetTopik: number;
    needsPrep: boolean;
    catalogueEmpty: boolean;
    total: number;
    budgetKrw: number | null;
  }) {
    const { goal, topik, targetTopik, needsPrep, catalogueEmpty, total, budgetKrw } = options;

    return [
      {
        key: 'EDUCATION' as const,
        labelMn: 'Боловсрол',
        valueMn: `${LEVEL_LABELS[goal]} хөтөлбөрт мэдүүлэх боломжтой`,
        met: true,
      },
      {
        key: 'TOPIK' as const,
        labelMn: 'Солонгос хэл',
        valueMn: needsPrep
          ? `Одоо TOPIK ${topik || 0} — ${targetTopik} түвшин хэрэгтэй`
          : catalogueEmpty
            ? 'Ангиудын шаардлага бүртгэгдсэний дараа тодорхой болно'
            : topik > 0
              ? `TOPIK ${topik} — хангалттай`
              : 'Англи хэлээр эсвэл хэлний шаардлагагүй ангиуд боломжтой',
        // Unknown, not satisfied: there is nothing yet to have qualified for.
        met: catalogueEmpty ? null : !needsPrep,
      },
      {
        key: 'BUDGET' as const,
        labelMn: 'Төсөв',
        valueMn: budgetKrw ? 'Сонгосон төсөвт багтах ангиуд' : 'Төсвөө тохируулж үзээрэй',
        // Whether a budget is enough is a conversation, not a check mark.
        met: budgetKrw ? total > 0 : null,
      },
      {
        key: 'DOCUMENTS' as const,
        labelMn: 'Материал',
        valueMn: 'Диплом, дүнгийн тодорхойлолт, санхүүгийн баталгаа',
        met: null,
      },
    ];
  }

  /* --------------------------------------------------------------------- *
   * Money
   * --------------------------------------------------------------------- */

  /**
   * The first year in Korea, in the currency the family budgets in.
   *
   * Everything is totalled in ₮ because that is what the client pays and thinks
   * in; the Korean lines keep their ₩ alongside so the figure can be checked
   * against the school's own page. Our own fee is the only line that is not an
   * estimate — it is a price, from `ServicePricing`.
   */
  private buildCost(options: {
    serviceType: ServiceType;
    pricing: Awaited<ReturnType<PricingService['publicPricing']>>;
    krwToMnt: number;
    fxDate: Date;
    prices: { tuitionMin: number | null; tuitionMax: number | null; feeMin: number | null; feeMax: number | null };
    living: { monthlyMin: number | null; monthlyMax: number | null; tiers: string[] };
    nextStage: { titleMn: string; minKrw: number | null; maxKrw: number | null } | null;
  }) {
    const { serviceType, pricing, krwToMnt, fxDate, prices, living, nextStage } = options;
    const mnt = (krw: number | null) => (krw === null ? null : Math.round(krw * krwToMnt));

    const active = pricing.find((row) => row.serviceType === serviceType) ?? null;
    const items = [
      {
        key: 'SERVICE_FEE' as const,
        labelMn: 'GKS-ийн үйлчилгээний хураамж',
        noteMn: active ? `Урьдчилгаа нь ${this.formatMnt(active.prepaymentAmount)}` : null,
        minKrw: null,
        maxKrw: null,
        minMnt: active?.totalAmount ?? null,
        maxMnt: active?.totalAmount ?? null,
        isEstimate: false,
      },
      {
        key: 'TUITION' as const,
        labelMn: 'Сургалтын төлбөр (жилд)',
        noteMn: 'Сургуулиас хамаарч харилцан адилгүй. Хөнгөлөлт орсон дүн биш.',
        minKrw: prices.tuitionMin,
        maxKrw: prices.tuitionMax,
        minMnt: mnt(prices.tuitionMin),
        maxMnt: mnt(prices.tuitionMax),
        isEstimate: false,
      },
      {
        key: 'ADMISSION_FEE' as const,
        labelMn: 'Элсэлтийн хураамж (입학금)',
        noteMn: 'Зөвхөн эхний улиралд нэг удаа.',
        minKrw: prices.feeMin,
        maxKrw: prices.feeMax,
        minMnt: mnt(prices.feeMin),
        maxMnt: mnt(prices.feeMax),
        isEstimate: false,
      },
      {
        key: 'LIVING' as const,
        labelMn: 'Амьдрах зардал (жилд)',
        noteMn: this.livingNote(living),
        minKrw: living.monthlyMin === null ? null : living.monthlyMin * MONTHS_PER_YEAR,
        maxKrw: living.monthlyMax === null ? null : living.monthlyMax * MONTHS_PER_YEAR,
        minMnt: mnt(living.monthlyMin === null ? null : living.monthlyMin * MONTHS_PER_YEAR),
        maxMnt: mnt(living.monthlyMax === null ? null : living.monthlyMax * MONTHS_PER_YEAR),
        isEstimate: true,
      },
    ];

    const total = sumRange(items);
    return {
      items,
      totalMinMnt: total.min,
      totalMaxMnt: total.max,
      krwToMnt,
      fxDate: fxDate.toISOString(),
      nextStage,
    };
  }

  /**
   * "Сард ₩810,000 – ₩1,270,000 · Сөүл" — the monthly figure first, because
   * that is the number a family reasons in; the annual one on the row is the
   * number that goes in the total.
   */
  private livingNote(living: { monthlyMin: number | null; monthlyMax: number | null; tiers: string[] }): string | null {
    const monthly = this.formatKrwRange(living.monthlyMin, living.monthlyMax);
    const parts = [
      monthly ? `Сард ${monthly}` : null,
      living.tiers.length ? living.tiers.join(', ') : null,
      'байр, хоол, тээвэр орсон ойролцоо тооцоо',
    ].filter(Boolean);
    return parts.length > 1 ? `${parts.join(' · ')}.` : null;
  }

  private formatKrwRange(min: number | null, max: number | null): string | null {
    const format = (value: number) => `₩${new Intl.NumberFormat('mn-MN').format(value)}`;
    if (min === null && max === null) return null;
    if (min !== null && max !== null) return min === max ? format(min) : `${format(min)} – ${format(max)}`;
    return format((min ?? max) as number);
  }

  private formatMnt(value: number): string {
    return `${new Intl.NumberFormat('mn-MN').format(value)}₮`;
  }

  /**
   * What the CTA carries into `/consultation`.
   *
   * A consultant opening the lead should not have to guess what the visitor
   * was looking at — the plan is the first half of the conversation, written
   * down.
   */
  private buildNote(options: {
    goal: ProgramLevel;
    topik: number;
    /** The subject's Mongolian name, not its slug — a consultant reads this. */
    fieldName: string | null;
    regions: { value: string; label: string }[];
    region: string | null;
    stages: ReturnType<StudyPlanService['buildStages']>;
    matchCount: number;
  }): string {
    const { goal, topik, fieldName, regions, region, stages, matchCount } = options;
    const regionLabel = region ? (regions.find((row) => row.value === region)?.label ?? region) : null;
    const parts = [
      `Суралцах төлөвлөгөөнөөс: ${LEVEL_LABELS[goal]}`,
      topik > 0 ? `TOPIK ${topik}` : 'Солонгос хэлгүй',
      fieldName ? `чиглэл: ${fieldName}` : null,
      regionLabel ? `бүс: ${regionLabel}` : null,
    ].filter(Boolean);

    const path = stages
      .map((stage) => `${stage.titleMn} (${stage.start.year} оны ${stage.start.month}-р сар)`)
      .join(' → ');

    return [`${parts.join(', ')}.`, path ? `Зам: ${path}.` : null, `Тохирох анги: ${matchCount}.`]
      .filter(Boolean)
      .join(' ');
  }
}
