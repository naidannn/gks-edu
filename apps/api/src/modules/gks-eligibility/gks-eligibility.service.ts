import { Injectable } from '@nestjs/common';
import { EducationLevel, ServiceType } from '../../prisma/client.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { QueryGksEligibilityDto } from './dto/query-gks-eligibility.dto.js';
import type {
  GksDegree,
  GksFactor,
  GksReadinessBand,
  GksStrength,
} from './gks-eligibility.rules.js';
import {
  AGE_CAP,
  BAND_LABEL,
  SERVICE_FOR_DEGREE,
  buildFactors,
  buildImprovements,
  checkAge,
  checkEducation,
  degreeForEducation,
  monthsToEntry,
  nextRound,
  readinessBand,
  toGpaPercent,
  totalScore,
} from './gks-eligibility.rules.js';

/* ---------------------------------------------------------------------- *
 * The answer's shapes. Mirrored by `packages/shared/src/types/gks-eligibility.ts`
 * for the web app, the same hand-kept arrangement the planner uses.
 * ---------------------------------------------------------------------- */

type GksEligibilityVerdict = 'PASS' | 'REVIEW' | 'BLOCKED';

type GksCriterionKey = 'AGE' | 'EDUCATION' | 'GPA' | 'CITIZENSHIP' | 'PREVIOUS_AWARD' | 'HEALTH';

interface GksCriterion {
  key: GksCriterionKey;
  labelMn: string;
  requirementMn: string;
  valueMn: string;
  met: boolean | null;
  adviceMn: string | null;
}

interface GksTrackAdvice {
  key: 'EMBASSY' | 'UNIVERSITY';
  labelMn: string;
  reasonMn: string;
  choices: number;
}

interface GksDualTrackLine {
  serviceType: ServiceType;
  labelMn: string;
  totalAmount: number | null;
  prepaymentAmount: number | null;
  balanceWhenMn: string;
}

interface GksDualTrack {
  scholarship: GksDualTrackLine;
  regular: GksDualTrackLine;
  noExtraFee: boolean;
}

const DEGREE_LABELS: Record<GksDegree, string> = {
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
};

const EDUCATION_LABELS: Record<EducationLevel, string> = {
  [EducationLevel.SECONDARY_SCHOOL]: 'Бүрэн дунд',
  [EducationLevel.VOCATIONAL]: 'Мэргэжлийн',
  [EducationLevel.BACHELOR]: 'Бакалавр',
  [EducationLevel.MASTER]: 'Магистр',
  [EducationLevel.PHD]: 'Доктор',
};

/** The diploma each award asks for, worded the way the guideline words it. */
const EDUCATION_REQUIREMENT: Record<GksDegree, string> = {
  BACHELOR: 'Бүрэн дунд боловсрол эзэмшсэн, бакалаврын зэрэггүй байх',
  MASTER: 'Бакалаврын зэрэгтэй, эсвэл элсэх хүртэл төгсөх',
  PHD: 'Магистрын зэрэгтэй, эсвэл элсэх хүртэл төгсөх',
};

/**
 * A grade this far under the floor is still worth a consultant's eye: the
 * conversion between scales is our approximation, and the certified average a
 * university issues is not always the one a student remembers.
 */
const GPA_REVIEW_BAND = 4;

/**
 * GKS боломжийн шалгуур (ARCHITECTURE.md §3.5).
 *
 * This service answers the question that stops most of our clients before they
 * start — *"би тэнцэхгүй биз дээ"* — and it answers it in three separate
 * pieces, deliberately never blended into one number:
 *
 *   1. **Шалгуур.** Hard rules from the guideline. Most people pass, and being
 *      told so plainly is most of the value of the page.
 *   2. **Материалын хүч.** How strong the file they would send today is — five
 *      parts, each read as one of four words, and one overall stage, with the
 *      four biggest moves available to them. Never a number, and never a
 *      probability of winning: nobody can compute that honestly, and a mark is
 *      what a frightened reader stops at instead of reading the advice.
 *   3. **Давхар зам.** What happens if the answer from NIIED is no —
 *      `gksedu.md` §4.3's clause that the same client files a regular admission
 *      alongside the scholarship without a second brokerage fee. This is the
 *      business's actual concept, and it is the part that makes the risk of
 *      applying survivable.
 *
 * Prices come from `ServicePricing` and are never written down here (§5.4);
 * dates are month-level and labelled estimated, because inventing a GKS
 * deadline would be inventing the one thing a person plans a year around.
 */
@Injectable()
export class GksEligibilityService {
  constructor(private readonly pricing: PricingService) {}

  async check(query: QueryGksEligibilityDto) {
    const now = new Date();
    const degree = query.degree;
    const strengths = query.strengths ?? [];
    const blockers = query.blockers ?? [];
    const topik = Math.min(Math.max(query.topik ?? 0, 0), 6);
    const english = query.english ?? 'NONE';
    const graduating = query.graduating ?? false;
    const gpaPercent = toGpaPercent(query.gpa, query.gpaScale);

    // The round this person would be applying to is also what the age cap is
    // read on, so it is computed once and both answers come off it.
    const round = nextRound(degree, now);

    const criteria = this.buildCriteria({
      degree,
      age: query.age,
      monthsToEntry: monthsToEntry(round, now),
      education: query.education,
      graduating,
      gpa: query.gpa,
      gpaScale: query.gpaScale,
      gpaPercent,
      strengths,
      blockers,
    });

    const verdict: GksEligibilityVerdict = criteria.some((row) => row.met === false)
      ? 'BLOCKED'
      : criteria.some((row) => row.met === null)
        ? 'REVIEW'
        : 'PASS';

    const scoreInput = { gpaPercent, topik, english, strengths };
    const factors = buildFactors(scoreInput);
    // The one place a number is computed, and it stays here: it picks the band
    // and orders the advice, and never reaches the page (ARCHITECTURE.md §3.5).
    const band = readinessBand(totalScore(scoreInput));

    const pricing = await this.pricing.publicPricing();

    return {
      input: {
        degree,
        age: query.age,
        education: query.education,
        graduating,
        gpa: query.gpa,
        gpaScale: query.gpaScale,
        topik,
        english,
        strengths,
        blockers,
      },
      gpaPercent,
      eligibility: {
        verdict,
        headlineMn: this.headline(verdict, degree),
        summaryMn: this.summary(verdict, criteria),
        criteria,
      },
      readiness: {
        band,
        labelMn: BAND_LABEL[band],
        summaryMn: this.readinessSummary(band),
        factors,
      },
      improvements: buildImprovements({ gpaPercent, topik, english, strengths, graduating }).slice(0, 4),
      round,
      track: this.trackAdvice(degree, strengths),
      dualTrack: this.dualTrack(degree, pricing),
      consultationNote: this.buildNote({ degree, verdict, gpaPercent, topik, band, factors }),
      suggestedDegree: this.suggestedDegree(degree, query.education),
    };
  }

  /* ------------------------------------------------------------------- *
   * The hard rules
   * ------------------------------------------------------------------- */

  private buildCriteria(input: {
    degree: GksDegree;
    age: number;
    /** Whole months between today and the entry date the cap is read on. */
    monthsToEntry: number;
    education: EducationLevel;
    graduating: boolean;
    gpa: number;
    gpaScale: string;
    gpaPercent: number;
    strengths: GksStrength[];
    blockers: string[];
  }): GksCriterion[] {
    const { degree, age, education, graduating, gpa, gpaScale, gpaPercent, strengths, blockers } = input;

    const ageMet = checkAge(age, degree, input.monthsToEntry);
    const educationCheck = checkEducation(education, degree);
    const topTwenty = strengths.includes('TOP_20_PERCENT');
    const gpaMet = gpaPercent >= 80 || topTwenty
      ? true
      : gpaPercent >= 80 - GPA_REVIEW_BAND
        ? null
        : false;

    return [
      {
        key: 'AGE',
        labelMn: 'Нас',
        requirementMn: `Элсэх үедээ ${AGE_CAP[degree]} нас хүрээгүй байх`,
        valueMn: `${age} нас`,
        met: ageMet,
        adviceMn:
          ageMet === false
            ? `Элсэх үед ${DEGREE_LABELS[degree]}-ын тэтгэлгийн насны хязгаараас хэтэрнэ. ${
                degree === 'BACHELOR'
                  ? 'Бакалаврын дараах түвшинд 40 нас хүртэл өгөх боломжтой, мөн энгийн зуучлалаар үндсэн ангид элсэх зам нээлттэй.'
                  : 'Энгийн зуучлалаар үндсэн ангид элсэх зам танд нээлттэй хэвээр байна.'
              }`
            : ageMet === null
              ? 'Насыг элсэх өдрөөр тооцдог тул таны төрсөн өдрөөс шалтгаална — зөвлөхөөр нэг удаа шалгуулаарай.'
              : null,
      },
      {
        key: 'EDUCATION',
        labelMn: 'Боловсрол',
        requirementMn: EDUCATION_REQUIREMENT[degree],
        valueMn: `${EDUCATION_LABELS[education]}${graduating ? ' (төгсөх шатанд)' : ' төгссөн'}`,
        met: educationCheck.met,
        adviceMn: educationCheck.met
          ? null
          : educationCheck.overqualified
            ? 'Бакалаврын зэрэгтэй хүн GKS-ийн бакалаврын тэтгэлэгт өгөх боломжгүй. Танд магистрын тэтгэлэг нээлттэй — дээрх сонголтоо солиод дахин шалгаарай.'
            : `${DEGREE_LABELS[degree]}-ын тэтгэлэгт өгөхийн тулд эхлээд ${EDUCATION_REQUIREMENT[degree].toLowerCase()} шаардлагатай.`,
      },
      {
        key: 'GPA',
        labelMn: 'Голч дүн',
        requirementMn: '100 онооны системд 80, эсвэл ангидаа эхний 20%-д багтах',
        // The conversion is only worth showing when there was one: a grade
        // already on the 100-point scale reading "88/100 ≈ 88/100" looks like
        // a bug, and on this page anything that looks like a bug costs trust.
        valueMn: [
          `${gpa}/${gpaScale}`,
          gpaScale === '100' ? null : `≈ ${gpaPercent}/100`,
          topTwenty ? 'ангидаа эхний 20%' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        met: gpaMet,
        adviceMn:
          gpaMet === false
            ? 'Голч шалгуурт хүрэхгүй байна. Ангидаа эхний 20%-д багтдаг бол энэ шалгуурыг мөн хангана — сургуулиасаа албан тодорхойлолт авч болно.'
            : gpaMet === null
              ? 'Голч шалгуурын зааг дээр байна. Сургуулиудын дүнгийн систем ялгаатай тул албан ёсны хуулбараар нягтлах шаардлагатай.'
              : null,
      },
      {
        key: 'CITIZENSHIP',
        labelMn: 'Иргэншил',
        requirementMn: 'Өөрөө болон эцэг эх нь БНСУ-ын иргэн биш байх',
        valueMn: blockers.includes('KOREAN_CITIZEN') ? 'БНСУ-ын иргэншилтэй' : 'Монгол Улсын иргэн',
        met: !blockers.includes('KOREAN_CITIZEN'),
        adviceMn: blockers.includes('KOREAN_CITIZEN')
          ? 'БНСУ-ын иргэн GKS-д хамрагдахгүй. Гэхдээ энгийн элсэлтийн зам бүрэн нээлттэй.'
          : null,
      },
      {
        key: 'PREVIOUS_AWARD',
        labelMn: 'Өмнөх тэтгэлэг',
        requirementMn: 'Өмнө нь GKS тэтгэлэг аваагүй, Солонгост ижил түвшний зэрэг хамгаалаагүй байх',
        valueMn: blockers.includes('PREVIOUS_GKS')
          ? 'Өмнө нь GKS авсан'
          : blockers.includes('DEGREE_IN_KOREA')
            ? 'Солонгост зэрэг хамгаалсан'
            : 'Үгүй',
        met: !blockers.includes('PREVIOUS_GKS') && !blockers.includes('DEGREE_IN_KOREA'),
        adviceMn:
          blockers.includes('PREVIOUS_GKS') || blockers.includes('DEGREE_IN_KOREA')
            ? 'Онцгой тохиолдолд дараагийн түвшинд дахин өгөх боломж нээгддэг. Энэ нь тухайн жилийн зарлалаас хамаардаг тул зөвлөхөөр шалгуулна уу.'
            : null,
      },
      {
        key: 'HEALTH',
        labelMn: 'Эрүүл мэнд',
        requirementMn: 'Гадаадад суралцахад саад болох өвчин, эмгэггүй байх',
        valueMn: blockers.includes('HEALTH') ? 'Тодруулах шаардлагатай' : 'Хэвийн',
        met: blockers.includes('HEALTH') ? null : true,
        adviceMn: blockers.includes('HEALTH')
          ? 'Эрүүл мэндийн байдлыг элсэлтийн шатанд эмнэлгийн дүгнэлтээр тодорхойлно. Ихэнх тохиолдолд саад болдоггүй — зөвлөхтэй ярилцаарай.'
          : null,
      },
    ];
  }

  private headline(verdict: GksEligibilityVerdict, degree: GksDegree): string {
    if (verdict === 'PASS') return `Та GKS-ийн ${DEGREE_LABELS[degree].toLowerCase()}ын тэтгэлэгт мэдүүлэх шалгуурыг хангаж байна`;
    if (verdict === 'REVIEW') return 'Нэг нөхцөл тодруулга шаардаж байна';
    return 'Энэ хэлбэрээр GKS-д мэдүүлэх боломж хараахан алга';
  }

  /**
   * The sentence that does the real work on this page.
   *
   * A person who arrived afraid of being rejected needs two facts in one
   * breath: the door is open, *and* passing the criteria is not the same thing
   * as winning. Saying only the first sells; saying only the second scares.
   */
  private summary(verdict: GksEligibilityVerdict, criteria: GksCriterion[]): string {
    if (verdict === 'PASS') {
      return (
        'Шалгуур хангана гэдэг нь тэтгэлэг авна гэсэн үг биш, мэдүүлэх эрх нээлттэй гэсэн үг. ' +
        'Доор таны материал өнөөдөр хэр хүчтэй байгааг, юуг сайжруулбал хамгийн их үр дүнтэйг харуулав.'
      );
    }
    if (verdict === 'REVIEW') {
      const pending = criteria.filter((row) => row.met === null).map((row) => row.labelMn.toLowerCase());
      return `Бусад шалгуурыг хангасан байна. ${pending.join(', ')} — эдгээрийг албан баримтаар нэг удаа нягтлахад л асуудал шийдэгдэнэ.`;
    }
    const failed = criteria.filter((row) => row.met === false).map((row) => row.labelMn.toLowerCase());
    // The list opens the sentence, so the first name is capitalised again.
    const opening = failed.join(', ').replace(/^./, (first) => first.toUpperCase());
    return (
      `${opening} шалгуур хангагдахгүй байна. Гэхдээ Солонгост суралцах зам үүгээр хаагдахгүй — ` +
      'энгийн зуучлалаар үндсэн анги, хэлний бэлтгэлд элсэх боломж танд нээлттэй хэвээр.'
    );
  }

  /**
   * How the whole application stands, in a sentence and without a mark.
   *
   * A visitor who is handed a number stops reading the advice and starts
   * comparing themselves to it — which is the fear this page exists to answer,
   * not to score. The sentence says the same thing and points at the next move.
   */
  private readinessSummary(band: GksReadinessBand): string {
    if (band === 'STRONG') {
      return 'Материалаа зөв бэлдвэл өрсөлдөх бүрэн боломжтой профайл. Одоо хамгийн чухал нь эсээ, тодорхойлолтын чанар.';
    }
    if (band === 'MODERATE') {
      return 'Суурь нь бүрдсэн, өрсөлдөөнд дутуу хэсгүүд байна. Доорх алхмуудаас эхний хоёрыг хийхэд байдал мэдэгдэхүйц өөрчлөгдөнө.';
    }
    return 'Одооноос эхэлбэл дараагийн улирлын мэдүүлэгт бэлтгэх бүрэн хугацаа байна. Хамгийн их нөлөөтэй алхмуудыг доор эрэмбэлэв.';
  }

  /* ------------------------------------------------------------------- *
   * Route and money
   * ------------------------------------------------------------------- */

  /**
   * Embassy or university track (`gksedu.md` §4.3).
   *
   * The embassy route is the default because it is the one with three
   * university choices on one national quota, and three choices is what most
   * applicants need. A research profile is the exception: a doctoral or
   * research-carrying applicant competes better inside one department that
   * wants exactly them than inside a national list.
   */
  private trackAdvice(degree: GksDegree, strengths: GksStrength[]): GksTrackAdvice {
    const researchLed = degree === 'PHD' || (degree === 'MASTER' && strengths.includes('RESEARCH'));
    if (researchLed) {
      return {
        key: 'UNIVERSITY',
        labelMn: 'Их сургуулийн төрөл',
        reasonMn:
          'Судалгааны чиглэлтэй хүн нэг сургууль, нэг тэнхимийн квот дээр өрсөлдөхөд давуу талтай. Танхим, удирдагч багштайгаа урьдчилан тохирох боломж нээгддэг.',
        choices: 1,
      };
    }
    return {
      key: 'EMBASSY',
      labelMn: 'Элчин сайдын яамны төрөл',
      reasonMn:
        'Монгол дахь БНСУ-ын Элчин сайдын яамаар дамжуулан мэдүүлж, гурван сургууль хүртэл сонгох боломжтой. Ихэнх монгол өргөдөл гаргагчид энэ замаар өгдөг.',
      choices: 3,
    };
  }

  /**
   * The dual track, priced from `ServicePricing`.
   *
   * The balance dates differ by service and the difference is the whole point
   * (`gksedu.md` §9): the scholarship balance falls due only *after* the
   * result, so an applicant who is not selected never reaches it — which is
   * exactly the answer to "тэнцэхгүй бол мөнгө маань яах вэ".
   */
  private dualTrack(
    degree: GksDegree,
    pricing: { serviceType: ServiceType; totalAmount: number; prepaymentAmount: number }[],
  ): GksDualTrack {
    const find = (serviceType: ServiceType) => pricing.find((row) => row.serviceType === serviceType) ?? null;

    const line = (
      serviceType: ServiceType,
      labelMn: string,
      balanceWhenMn: string,
    ): GksDualTrackLine => {
      const row = find(serviceType);
      return {
        serviceType,
        labelMn,
        totalAmount: row?.totalAmount ?? null,
        prepaymentAmount: row?.prepaymentAmount ?? null,
        balanceWhenMn,
      };
    };

    return {
      scholarship: line(
        ServiceType.GKS_SCHOLARSHIP,
        'Засгийн газрын тэтгэлгийн зуучлал',
        'Тэтгэлэгт тэнцсэний дараа',
      ),
      regular: line(
        SERVICE_FOR_DEGREE[degree],
        `${DEGREE_LABELS[degree]} — энгийн зуучлал`,
        'Виз гарсны дараа',
      ),
      // gksedu.md §4.3: a scholarship client takes the regular admission
      // alongside it without a second brokerage fee.
      noExtraFee: true,
    };
  }

  /** The award this person's own diploma points at, when it is not the one they asked about. */
  private suggestedDegree(degree: GksDegree, education: EducationLevel): GksDegree | null {
    const natural = degreeForEducation(education);
    return natural === degree ? null : natural;
  }

  /**
   * The line the office reads in the CRM. Everything the visitor answered, in
   * one sentence, so the first call starts from their profile rather than from
   * "сайн байна уу, та юу сонирхож байна?".
   */
  private buildNote(input: {
    degree: GksDegree;
    verdict: GksEligibilityVerdict;
    gpaPercent: number;
    topik: number;
    band: GksReadinessBand;
    factors: GksFactor[];
  }): string {
    const verdictMn =
      input.verdict === 'PASS' ? 'шалгуур хангасан' : input.verdict === 'REVIEW' ? 'тодруулах нөхцөлтэй' : 'шалгуур хангаагүй';
    // Which parts are thin, by name. More use to a consultant opening the call
    // than a mark would be — and the visitor sees this text in the form.
    const weak = input.factors.filter((row) => row.level === 'NONE' || row.level === 'PARTIAL');
    return [
      'GKS боломжийн шалгуураас:',
      `${DEGREE_LABELS[input.degree]} — ${verdictMn}.`,
      `Голч ≈ ${input.gpaPercent}/100, TOPIK ${input.topik || 'үгүй'}.`,
      `Материалын байдал: ${BAND_LABEL[input.band].toLowerCase()}.`,
      weak.length ? `Дутуу тал: ${weak.map((row) => row.labelMn.toLowerCase()).join(', ')}.` : 'Бүх хэсэг бүрдсэн.',
    ].join(' ');
  }
}
