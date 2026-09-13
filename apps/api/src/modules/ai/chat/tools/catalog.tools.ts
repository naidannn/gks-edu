import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessLevel, ProgramLevel, type AccreditationGrade } from '../../../../prisma/client.js';
import { QueryProgramsDto } from '../../../programs/dto/query-programs.dto.js';
import { ProgramsService } from '../../../programs/programs.service.js';
import { annualTuitionKrw, TERMS_PER_YEAR } from '../../../programs/tuition.js';
import { QueryUniversitiesDto } from '../../../universities/dto/query-universities.dto.js';
import { UniversitiesService } from '../../../universities/universities.service.js';
import { readBoolean, readEnum, readInt, readString, requireString } from './args.js';
import type { AiTool, AiToolProvider, ToolOutcome } from './tool.types.js';

const LEVELS = Object.values(ProgramLevel);

/** Few enough that the answer stays readable, and cheap enough to replay. */
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;

/**
 * The catalogue tools: schools and programmes (`AI-ASSISTANT.md` §5.3).
 *
 * All three call the public services, and that is what keeps them safe. The
 * catalogue's default order is the GKS rank, so these lists arrive in the order
 * the office would recommend — but `gksRank` and `gksScore` are not in the
 * public projection, so the order is all that reaches the model. `tuitionYear`
 * is absent for the same reason: it is a staff signal about a stale price, and
 * a visitor reading "2024 оны төлбөр" hears something we did not say.
 *
 * Tuition is per semester, because that is how Korean schools publish it. The
 * annual figure is derived here and labelled, never stored — and a language
 * institute's year is four terms, not two, which is exactly the arithmetic a
 * model gets wrong when it is handed a per-term number and left to multiply.
 */
@Injectable()
export class CatalogTools implements AiToolProvider {
  constructor(
    private readonly universities: UniversitiesService,
    private readonly programs: ProgramsService,
  ) {}

  tools(): AiTool[] {
    return [this.searchUniversities(), this.getUniversity(), this.searchPrograms()];
  }

  private searchUniversities(): AiTool {
    return {
      name: 'search_universities',
      minLevel: AccessLevel.PUBLIC,
      label: 'Сургуулиудыг хайж байна…',
      description:
        'Солонгосын их сургуулиудыг хайна. Нэр, хот, бүс, түвшин, GKS тэтгэлэгт хамрагдах эсэх, ' +
        'хэлний бэлтгэл авдаг эсэхээр шүүнэ. Хариу нь бидний зөвлөх дарааллаар эрэмбэлэгдсэн байна.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Сургуулийн нэр эсвэл хотын нэр' },
          region: { type: 'string', description: 'Бүсийн англи нэр, жишээ нь "Seoul", "Busan"' },
          level: { type: 'string', enum: LEVELS, description: 'Энэ түвшний хөтөлбөртэй сургуулиуд' },
          gksEligible: { type: 'boolean', description: 'Зөвхөн GKS тэтгэлэгт хамрагддаг сургуулиуд' },
          languagePrep: { type: 'boolean', description: 'Зөвхөн хэлний бэлтгэл авдаг сургуулиуд' },
          limit: { type: 'integer', description: `Хэдэн сургууль буцаах (дээд тал нь ${MAX_LIMIT})` },
        },
      },
      run: async (args): Promise<ToolOutcome> => {
        const query = Object.assign(new QueryUniversitiesDto(), {
          q: readString(args, 'query', 120),
          region: readString(args, 'region', 60),
          level: readEnum(args, 'level', LEVELS),
          gks: readBoolean(args, 'gksEligible'),
          languagePrep: readBoolean(args, 'languagePrep'),
          page: 1,
          limit: readInt(args, 'limit', 1, MAX_LIMIT) ?? DEFAULT_LIMIT,
        });

        const { items, meta } = await this.universities.findAll(query);
        const cards = items.map(universityCard);

        return {
          title: 'Сургуулийн хайлт',
          data: {
            total: meta.total,
            universities: cards.map(forModel),
          },
          card: {
            type: 'universities',
            data: { items: cards, total: meta.total, searchUrl: searchUrl(query) },
          },
        };
      },
    };
  }

  private getUniversity(): AiTool {
    return {
      name: 'get_university',
      minLevel: AccessLevel.PUBLIC,
      label: 'Сургуулийн мэдээллийг уншиж байна…',
      description:
        'Нэг сургуулийн дэлгэрэнгүй мэдээлэл — байршил, танилцуулга, хөтөлбөрийн тоо, ' +
        'нээлттэй элсэлтүүд. `slug`-ийг search_universities-ийн хариунаас ав.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string', description: 'Сургуулийн slug, жишээ нь "seoul-national-university"' },
        },
        required: ['slug'],
      },
      run: async (args): Promise<ToolOutcome> => {
        const slug = requireString(args, 'slug', 120);

        let university: Awaited<ReturnType<UniversitiesService['findBySlug']>>;
        try {
          university = await this.universities.findBySlug(slug);
        } catch (error) {
          if (error instanceof NotFoundException) {
            return {
              title: 'Сургууль олдсонгүй',
              data: { found: false, message: `"${slug}" гэсэн сургууль каталогид алга` },
            };
          }
          throw error;
        }

        const card = universityCard(university);

        return {
          title: university.nameMn,
          data: {
            ...forModel(card),
            танилцуулга: university.shortIntroMn,
            хөтөлбөрийн_тоо: university.programs.length,
            нээлттэй_элсэлт: university.intakes.length,
          },
          card: { type: 'university', data: { ...card, url: `/universities/${university.slug}` } },
        };
      },
    };
  }

  private searchPrograms(): AiTool {
    return {
      name: 'search_programs',
      minLevel: AccessLevel.PUBLIC,
      label: 'Хөтөлбөр, төлбөрийг шалгаж байна…',
      description:
        'Хөтөлбөр (анги, мэргэжил) болон сургалтын төлбөрийг хайна. Хэрэглэгчийн бичсэн үгээр ' +
        'хайдаг — жагсаалттай мэргэжлийн ангилал байхгүй. Төлбөр нь СЕМЕСТРийн төлбөр, ' +
        'жилийн дүн нь түүнээс гаргасан тооцоо.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Мэргэжлийн үг, жишээ нь "маркетинг", "IT", "경영"' },
          level: { type: 'string', enum: LEVELS },
          universitySlug: { type: 'string', description: 'Зөвхөн энэ сургуулийн хөтөлбөрүүд' },
          region: { type: 'string', description: 'Бүсийн англи нэр' },
          maxTuitionPerYearKrw: { type: 'integer', description: 'Жилийн төлбөр энэ дүнгээс хэтрэхгүй (вон)' },
          limit: { type: 'integer', description: `Хэдэн хөтөлбөр буцаах (дээд тал нь ${MAX_LIMIT})` },
        },
      },
      run: async (args): Promise<ToolOutcome> => {
        const query = Object.assign(new QueryProgramsDto(), {
          q: readString(args, 'keyword', 120),
          level: readEnum(args, 'level', LEVELS),
          university: readString(args, 'universitySlug', 120),
          region: readString(args, 'region', 60),
          tuitionMax: readInt(args, 'maxTuitionPerYearKrw', 0, 200_000_000),
          page: 1,
          limit: readInt(args, 'limit', 1, MAX_LIMIT) ?? DEFAULT_LIMIT,
        });

        const { items, meta } = await this.programs.findAll(query);
        const cards = items.map(programCard);

        return {
          title: 'Хөтөлбөрийн хайлт',
          data: {
            total: meta.total,
            тайлбар: 'tuitionPerTermKrw бол нэг семестрийн төлбөр. tuitionPerYearKrw = семестрийн төлбөр × жилийн улирлын тоо (termsPerYear).',
            programs: cards.map((card) => ({
              нэр: card.nameMn,
              сургууль: card.university.nameMn,
              түвшин: card.level,
              семестрийн_төлбөр_вон: card.tuitionPerTermKrw,
              жилийн_төлбөр_вон: card.tuitionPerYearKrw,
              жилийн_улирал: card.termsPerYear,
              topik: card.topikLevel,
              тэтгэлэг_хувь: card.scholarshipMaxPercent,
            })),
          },
          card: {
            type: 'programs',
            data: { items: cards, total: meta.total, searchUrl: programsUrl(query) },
          },
        };
      },
    };
  }
}

type UniversityRow = {
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string | null;
  cityMn: string | null;
  regionMn: string | null;
  logoPath: string | null;
  accreditation: AccreditationGrade;
  theKoreaRank: number | null;
  isGksEligible: boolean;
  acceptsLanguagePrep: boolean;
};

/** The public card, and nothing else — `AiUniversityCard` in the shared package. */
function universityCard(row: UniversityRow) {
  return {
    slug: row.slug,
    nameMn: row.nameMn,
    nameEn: row.nameEn,
    nameKo: row.nameKo,
    cityMn: row.cityMn,
    regionMn: row.regionMn,
    logoPath: row.logoPath,
    accreditation: row.accreditation,
    theKoreaRank: row.theKoreaRank,
    isGksEligible: row.isGksEligible,
    acceptsLanguagePrep: row.acceptsLanguagePrep,
  };
}

/**
 * The same school, smaller and in Mongolian, for the model.
 *
 * `accreditation` is spelled out rather than passed as an enum: the model's job
 * is to explain that an `EXCELLENT` school means simplified visa screening, and
 * a bare grade invites it to present the tier as a quality ranking instead —
 * which it is not, and must never be shown as (CLAUDE.md).
 */
function forModel(card: ReturnType<typeof universityCard>) {
  return {
    slug: card.slug,
    нэр: card.nameMn,
    нэр_en: card.nameEn,
    хот: card.cityMn,
    визийн_итгэмжлэл: ACCREDITATION_MN[card.accreditation],
    the_рейтинг: card.theKoreaRank,
    gks_тэтгэлэгт_хамрагдана: card.isGksEligible,
    хэлний_бэлтгэлтэй: card.acceptsLanguagePrep,
  };
}

const ACCREDITATION_MN: Record<AccreditationGrade, string> = {
  EXCELLENT: 'Шилдэг итгэмжлэгдсэн (우수인증대학) — оюутны виз хялбаршуулсан журмаар шалгагдана',
  CERTIFIED: 'Итгэмжлэгдсэн (인증대학)',
  NONE: 'Итгэмжлэлийн жагсаалтад ороогүй',
};

type ProgramRow = {
  id: string;
  nameMn: string;
  nameEn: string | null;
  level: ProgramLevel;
  durationYears: number | null;
  tuitionPerTermKrw: number | null;
  tuitionPerYearKrw: number | null;
  topikLevel: number | null;
  scholarshipMaxPercent: number | null;
  faculty: { nameMn: string } | null;
  university: { slug: string; nameMn: string; logoPath: string | null };
};

function programCard(row: ProgramRow) {
  return {
    id: row.id,
    nameMn: row.nameMn,
    nameEn: row.nameEn,
    level: row.level,
    university: {
      slug: row.university.slug,
      nameMn: row.university.nameMn,
      logoPath: row.university.logoPath,
    },
    facultyMn: row.faculty?.nameMn ?? null,
    tuitionPerTermKrw: row.tuitionPerTermKrw,
    tuitionPerYearKrw: annualTuitionKrw(row),
    termsPerYear: TERMS_PER_YEAR[row.level],
    topikLevel: row.topikLevel,
    scholarshipMaxPercent: row.scholarshipMaxPercent,
    durationYears: row.durationYears,
  };
}

/** The catalogue page that shows the same list, so the card can link to it. */
function searchUrl(query: QueryUniversitiesDto): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.region) params.set('region', query.region);
  if (query.level) params.set('level', query.level);
  if (query.gks) params.set('gks', 'true');
  if (query.languagePrep) params.set('languagePrep', 'true');

  const search = params.toString();
  return search ? `/universities?${search}` : '/universities';
}

function programsUrl(query: QueryProgramsDto): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.level) params.set('level', query.level);
  if (query.university) params.set('university', query.university);
  if (query.region) params.set('region', query.region);
  if (query.tuitionMax) params.set('tuitionMax', String(query.tuitionMax));

  const search = params.toString();
  return search ? `/programs?${search}` : '/programs';
}
