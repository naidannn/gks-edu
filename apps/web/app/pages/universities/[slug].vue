<script setup lang="ts">
import type { FacultyRef, IntakeTerm, ProgramLevel, UniversityDetail, UniversityProgram } from '@gks/shared';

/**
 * One school, in the order a visitor actually asks about it (1A-07).
 *
 * The two questions that bring somebody to this page are "when can I apply?"
 * and "what can I study, and what does it cost?", so the intake calendar and
 * the programme list come first and everything descriptive follows them.
 *
 * Nothing here renders an empty row. Whole groups of fields in the dataset are
 * unfilled by design — dormitory prices, transit, international-student counts
 * — and a column of "мэдээлэл шинэчлэгдэж байна" reads as a broken page rather
 * than as honesty; a card with no facts in it is simply not rendered. The rule
 * that note protects is untouched: a number we do not have is never printed as
 * a zero, and a tuition figure still says which year it was read off.
 */
const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { data: university, error } = await useApiFetch<UniversityDetail>(
  () => `/universities/${slug.value}`,
);

if (error.value || !university.value) {
  throw createError({ statusCode: 404, statusMessage: 'Сургууль олдсонгүй', fatal: true });
}

const uni = computed(() => university.value!);
const quality = computed(() => uni.value.quality ?? {});

// 1A-18 — save to shortlist.
const { ensureLoaded, isSaved, toggle: toggleSaved } = useSavedUniversities();
onMounted(ensureLoaded);
const savePending = ref(false);
const meta = useMetaTracking();
async function onToggleSaved() {
  savePending.value = true;
  const wasSaved = isSaved(uni.value.id);
  try {
    await toggleSaved(uni.value.id);
    // Only adding is a signal; un-saving is the visitor changing their mind,
    // and reporting it as an intent event would teach the campaign nothing.
    if (!wasSaved) {
      meta.track('AddToWishlist', {
        content_type: 'product',
        content_ids: [uni.value.slug],
        content_name: uni.value.nameMn,
      });
    }
  } finally {
    savePending.value = false;
  }
}

/**
 * `ViewContent` — the school page is the closest thing this site has to a
 * product page, and it is what a retargeting audience is built from (1A-38).
 * In `onMounted` because the plugin is client-only.
 */
onMounted(() => {
  meta.track('ViewContent', {
    content_type: 'product',
    content_ids: [uni.value.slug],
    content_name: uni.value.nameMn,
    content_category: 'university',
  });
});

/**
 * Road distance to Seoul, rounded to the kilometre.
 *
 * The dataset carries a decimal ("3.7"), which is precision the number does not
 * have — it is a straight-line estimate between two city points, and the figure
 * a visitor uses it for is "can I get there in a morning".
 */
/**
 * The paragraph under the name.
 *
 * The import built `detailedIntroMn` as the short intro with the school's
 * strengths appended ("… Гол онцлог: a; b; c"), and those strengths already
 * have their own card further down — printing both says everything twice. So a
 * detailed intro is used only when somebody has written genuinely different
 * text into it, and otherwise the one-line identity is the lede.
 */
const lede = computed(() => {
  const { shortIntroMn, detailedIntroMn } = uni.value;
  if (detailedIntroMn && !(shortIntroMn && detailedIntroMn.startsWith(shortIntroMn))) {
    return detailedIntroMn;
  }
  return shortIntroMn ?? detailedIntroMn;
});

/** "Сөүл" for the special cities, "Тэжон, Тэжон" is a repetition, not an address. */
const place = computed(() => {
  const u = uni.value;
  return u.cityMn === u.regionMn ? u.cityMn : `${u.cityMn}, ${u.regionMn}`;
});

const distanceFromSeoul = computed(() => {
  const km = uni.value.distanceFromSeoulKm;
  if (km === null) return null;
  const rounded = Math.round(km);
  return rounded < 1 ? '1 км хүрэхгүй' : `${formatNumber(rounded)} км`;
});

/* -------------------------------------------------------------------------- *
 * The band under the name: the four numbers that identify a school.
 * -------------------------------------------------------------------------- */

interface HeroStat {
  key: string;
  label: string;
  value: string;
  /** A qualifier under the number — the year of a rank, the time to Seoul. */
  hint?: string | null;
  /** Provenance for the value, from the record's `quality` block. */
  source?: string | null;
}

const heroStats = computed<HeroStat[]>(() => {
  const u = uni.value;
  const stats: HeroStat[] = [];

  // Times Higher Education's South Korea table — the only rank shown publicly.
  // 41 Korean schools are in it, so an absent tile means "not listed", which is
  // what the note under the band says rather than leaving a dash to be read as
  // a bad score (ARCHITECTURE.md §3.1).
  if (u.theKoreaRank) {
    stats.push({
      key: 'rank',
      label: 'Солонгост',
      value: `#${u.theKoreaRank}`,
      hint: u.theWorldRank ? `Дэлхийд ${u.theWorldRank}` : null,
    });
  }
  if (u.foundedYear) {
    stats.push({
      key: 'founded',
      label: 'Байгуулагдсан',
      value: `${u.foundedYear}`,
      hint: 'он',
      source: quality.value.founded,
    });
  }
  const students = formatNumber(u.studentsTotal);
  if (students) {
    stats.push({
      key: 'students',
      label: 'Оюутны тоо',
      value: students,
      source: quality.value.students,
    });
  }
  if (distanceFromSeoul.value) {
    stats.push({
      key: 'seoul',
      label: 'Сөүлээс',
      value: distanceFromSeoul.value,
      hint: u.travelTimeFromSeoul,
    });
  }
  return stats;
});

const THE_RANKED_KOREAN_UNIVERSITIES = 41;
const rankNote = computed(() =>
  uni.value.theKoreaRank
    ? `Эх сурвалж: Times Higher Education — South Korea Rank${uni.value.theRankYear ? ` ${uni.value.theRankYear}` : ''}.`
    : `Times Higher Education-ийн Солонгосын жагсаалтад ${THE_RANKED_KOREAN_UNIVERSITIES} их сургууль ` +
      'ордог бөгөөд энэ сургууль түүнд ороогүй байна. Энэ нь чанарын үнэлгээ биш.',
);

/* -------------------------------------------------------------------------- *
 * Элсэлт — the calendar, and the one deadline a client works to.
 * -------------------------------------------------------------------------- */

/** Group the intake terms by programme level so the table reads by track. */
const intakesByLevel = computed<[ProgramLevel, IntakeTerm[]][]>(() => {
  const groups = new Map<ProgramLevel, IntakeTerm[]>();
  for (const intake of uni.value.intakes) {
    const list = groups.get(intake.level) ?? [];
    list.push(intake);
    groups.set(intake.level, list);
  }
  return [...groups.entries()];
});

/** The soonest round still open — the date the section leads with. */
const nextIntake = computed<IntakeTerm | null>(() => {
  const open = uni.value.intakes.filter(
    (intake) => intake.phase !== 'CLOSED' && intake.internalDeadline !== null,
  );
  if (!open.length) return null;
  return open.reduce((soonest, intake) =>
    intake.internalDeadline! < soonest.internalDeadline! ? intake : soonest,
  );
});

/**
 * The caveats the office wrote on individual rounds, said once.
 *
 * Most schools carry the same sentence on every one of their eight rounds
 * ("generated from the general calendar, not confirmed by the school"), and
 * repeating it eight times in a table turns a real warning into wallpaper.
 */
const intakeNotes = computed(() => [
  ...new Set(uni.value.intakes.map((intake) => intake.note).filter((note): note is string => !!note)),
]);

function countdownLabel(days: number | null): string {
  if (days === null) return 'Хугацаа тодорхойгүй';
  if (days < 0) return 'Хугацаа дууссан';
  if (days === 0) return 'Өнөөдөр хаагдана';
  return `${days} хоног үлдлээ`;
}

/** Urgency, not status — the row already says whether registration is open. */
function countdownTone(days: number | null): BadgeTone {
  if (days === null || days < 0) return 'neutral';
  if (days <= 7) return 'danger';
  if (days <= 21) return 'warning';
  return 'success';
}

/* -------------------------------------------------------------------------- *
 * Анги — the school's own structure: танхим (단과대학) → анги.
 * -------------------------------------------------------------------------- */

interface FacultyGroup {
  key: string;
  faculty: FacultyRef | null;
  programs: UniversityProgram[];
}

/**
 * Departments under the college they belong to.
 *
 * A programme with no faculty is normal rather than unfiled — a graduate
 * department and every language course sit outside the undergraduate colleges —
 * so that group leads the list without a heading instead of being labelled with
 * an apology (ARCHITECTURE.md §3.3).
 */
const programsByFaculty = computed<FacultyGroup[]>(() => {
  const groups = new Map<string, FacultyGroup>();
  for (const program of uni.value.programs) {
    const key = program.faculty?.id ?? '';
    const group = groups.get(key) ?? { key, faculty: program.faculty, programs: [] };
    group.programs.push(program);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.faculty) return -1;
    if (!b.faculty) return 1;
    return a.faculty.nameMn.localeCompare(b.faculty.nameMn, 'mn');
  });
});

/** The school's own wording for a department, under the Mongolian name. */
function programNativeName(program: UniversityProgram): string | null {
  const native = program.nameKo ?? program.nameEn;
  return native && native !== program.nameMn ? native : null;
}

/** The Korean wording under a college's name, unless it is the same string. */
function facultyNativeName(faculty: FacultyRef): string | null {
  return faculty.nameKo && faculty.nameKo !== faculty.nameMn ? faculty.nameKo : null;
}

/** The chips after a programme's name: length, language, entry requirement. */
function programMeta(program: UniversityProgram): string[] {
  const meta: string[] = [INSTRUCTION_LANGUAGE_LABELS[program.language]];
  if (program.durationYears) meta.push(`${program.durationYears} жил`);
  if (program.topikLevel) meta.push(`TOPIK ${program.topikLevel}`);
  else if (program.ieltsScore) meta.push(`IELTS ${program.ieltsScore}`);
  return meta;
}

/* -------------------------------------------------------------------------- *
 * The descriptive half of the page.
 * -------------------------------------------------------------------------- */

interface Fact {
  label: string;
  value: string | null;
  source?: string | null;
}

/**
 * The spec sheet, minus everything the band above already says.
 *
 * `campusInfo` is deliberately not here: what the import left in that column is
 * an English infobox fragment ("Urban", "| former_names ="), which is a data
 * problem and not something to dress up on a public page.
 */
const facts = computed<Fact[]>(() => {
  const u = uni.value;
  const rows: Fact[] = [
    { label: 'Төрөл', value: UNIVERSITY_TYPE_LABELS[u.type] },
    { label: 'Байршил', value: place.value },
    { label: 'Хаяг', value: u.address },
    { label: 'Ойр метро / автобус', value: u.nearestTransit },
    { label: 'Гадаад оюутан', value: formatNumber(u.internationalStudents) },
    { label: 'Монгол оюутан', value: formatNumber(u.mongolianStudents) },
    { label: 'Кампусын тоо', value: formatNumber(u.numCampuses) },
  ];
  return rows.filter((row) => row.value);
});

const links = computed(() => {
  const l = uni.value.links ?? {};
  return [
    { key: 'site', label: 'Албан ёсны вэб', href: l.officialWebsite },
    { key: 'maps', label: 'Газрын зураг', href: l.googleMaps },
    { key: 'wiki', label: 'Википедиа', href: l.wikipedia },
  ].filter((link): link is { key: string; label: string; href: string } => !!link.href);
});

const cost = computed(() => uni.value.livingCost);
const costRows = computed<Fact[]>(() => {
  const c = cost.value;
  if (!c) return [];
  const range = (pair?: [number, number] | null) => (pair ? formatKrwRange(pair[0], pair[1]) : null);
  return [
    { label: 'Орон сууц / байр', value: range(c.housing) },
    { label: 'Хоол', value: range(c.food) },
    { label: 'Тээвэр', value: range(c.transport) },
    { label: 'Бусад', value: range(c.other) },
  ].filter((row) => row.value);
});
const monthlyTotal = computed(() =>
  formatKrwRange(cost.value?.monthlyTotalMin, cost.value?.monthlyTotalMax),
);

/**
 * Dormitory rows, and only real ones.
 *
 * Every record carries the same imported sentence in `dormitory.note` — a
 * ballpark for Korean dormitories in general, ending in an instruction to the
 * member of staff who is supposed to replace it. It is not about this school
 * and it is not addressed to a client, so it is not rendered; the card appears
 * once somebody has actually filled a price in.
 */
const dormitoryRows = computed<Fact[]>(() => {
  const dorm = uni.value.dormitory;
  if (!dorm) return [];
  return [
    {
      label: 'Дотуур байртай эсэх',
      value: dorm.available === null || dorm.available === undefined
        ? null
        : dorm.available ? 'Тийм' : 'Үгүй',
    },
    { label: 'Сарын төлбөр', value: formatKrw(dorm.pricePerMonthKrw) },
    { label: 'Улирлын төлбөр', value: formatKrw(dorm.pricePerSemesterKrw) },
    { label: 'Барьцаа', value: formatKrw(dorm.depositKrw) },
    { label: 'Өрөөний төрөл', value: dorm.roomTypes?.length ? dorm.roomTypes.join(', ') : null },
  ].filter((row) => row.value);
});

const siteUrl = useSiteUrl();
const absoluteUrl = useAbsoluteUrl();

useHead(() => ({
  // Schools are named in English across the whole public site — the Mongolian
  // transliteration varies between sources, while the English name is what a
  // visitor can match against the school's own site and paperwork.
  title: uni.value.nameEn,
  // JSON-LD (1A-19): the school itself, plus the trail the visible breadcrumb
  // above the <h1> already draws. `url` is this page, not the school's own site
  // — the entity being described here is our page about it; the school's site
  // is a `sameAs`, which is what tells Google the two are the same institution.
  script: [
    jsonLdScript({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'EducationalOrganization',
          // `name` tracks the visible <h1>; the other two are alternates.
          name: uni.value.nameEn,
          alternateName: [uni.value.nameMn, uni.value.nameKo].filter(Boolean),
          address: {
            '@type': 'PostalAddress',
            addressLocality: uni.value.cityEn,
            addressRegion: uni.value.regionEn,
            addressCountry: 'KR',
          },
          url: `${siteUrl}/universities/${slug.value}`,
          sameAs: [uni.value.links?.officialWebsite].filter(Boolean),
          logo: absoluteUrl(uni.value.logoPath),
        },
        {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Нүүр', item: siteUrl },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'Их сургуулиуд',
              item: `${siteUrl}/universities`,
            },
            { '@type': 'ListItem', position: 3, name: uni.value.nameEn },
          ],
        },
      ],
    }),
  ],
}));
useSeoMeta({
  description: () =>
    uni.value.shortIntroMn ??
    `${uni.value.nameEn} — ${uni.value.cityMn}, Солонгос. Элсэлт, зардал, зуучлалын мэдээлэл.`,
  ogTitle: () => `${uni.value.nameEn} · GKS Edu`,
  ogType: 'article',
});
</script>

<template>
  <article v-if="university" class="gks-uni">
    <nav class="gks-uni__crumbs" aria-label="Замын мөр">
      <NuxtLink to="/universities">Сургуулиуд</NuxtLink>
      <span aria-hidden="true">/</span>
      <span>{{ uni.nameEn }}</span>
    </nav>

    <!-- Hero: who this school is, and the two things a visitor can do next. -->
    <header class="gks-uni__hero">
      <div class="gks-uni__head">
        <img
          v-if="uni.logoPath"
          :src="uni.logoPath"
          :alt="`${uni.nameEn} лого`"
          class="gks-uni__logo"
          width="88"
          height="88"
        >
        <!-- 30 of the 135 schools have no logo file; the tile keeps its place
             in the grid rather than letting the name slide left. -->
        <div v-else class="gks-uni__logo gks-uni__logo--empty" aria-hidden="true">
          <DsIcon name="landmark" :size="32" />
        </div>
        <div class="gks-uni__identity">
          <h1 class="gks-uni__title">{{ uni.nameEn }}</h1>
          <p class="gks-uni__names">{{ uni.nameMn }} · {{ uni.nameKo }}</p>
          <div class="gks-uni__tags">
            <DsBadge tone="neutral">{{ UNIVERSITY_TYPE_LABELS[uni.type] }}</DsBadge>
            <DsBadge tone="neutral" icon="map-pin">{{ place }}</DsBadge>
            <DsBadge v-if="uni.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл авдаг</DsBadge>
            <DsBadge v-if="uni.isGksEligible" tone="accent">GKS тэтгэлэг</DsBadge>
          </div>
        </div>
        <div class="gks-uni__cta">
          <DsButton
            variant="accent"
            icon-right="arrow-right"
            @click="navigateTo(`/consultation?university=${uni.slug}`)"
          >
            Энэ сургуулиар зөвлөгөө авах
          </DsButton>
          <DsButton
            variant="secondary"
            :icon-left="isSaved(uni.id) ? 'bookmark-check' : 'bookmark'"
            :loading="savePending"
            @click="onToggleSaved"
          >
            {{ isSaved(uni.id) ? 'Хадгалсан' : 'Хадгалах' }}
          </DsButton>
        </div>
      </div>

      <p v-if="lede" class="gks-uni__lede">{{ lede }}</p>

      <div v-if="heroStats.length" class="gks-uni__stats">
        <div v-for="stat in heroStats" :key="stat.key" class="gks-uni__stat">
          <span class="gks-uni__stat-label">{{ stat.label }}</span>
          <strong class="gks-uni__stat-value gks-tnum">{{ stat.value }}</strong>
          <span v-if="stat.hint" class="gks-uni__stat-hint">{{ stat.hint }}</span>
          <CommonQualityBadge v-if="stat.source" :source="stat.source" />
        </div>
      </div>
      <p class="gks-uni__rank-note">{{ rankNote }}</p>
    </header>

    <!-- 1 · Элсэлт. The page's first question: when can I apply? -->
    <DsCard v-if="intakesByLevel.length" title="Элсэлтийн хугацаа">
      <template #action>
        <NuxtLink class="gks-uni__more" :to="{ path: '/admissions', query: { q: uni.nameEn } }">
          Бүх элсэлт <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </template>

      <!-- The nearest deadline, before the table that repeats it. -->
      <div v-if="nextIntake" class="gks-uni__next">
        <div>
          <span class="gks-uni__next-label">Дараагийн эцсийн хугацаа</span>
          <strong class="gks-uni__next-date gks-tnum">
            {{ formatNumericDateUtc(nextIntake.internalDeadline) }}
          </strong>
          <span class="gks-uni__next-term">
            {{ PROGRAM_LEVEL_LABELS[nextIntake.level] }} ·
            {{ nextIntake.year }} оны
            {{ INTAKE_MONTH_LABELS[nextIntake.month] ?? `${nextIntake.month}-р сар` }}
          </span>
        </div>
        <DsBadge :tone="countdownTone(nextIntake.daysUntilInternalDeadline)">
          {{ countdownLabel(nextIntake.daysUntilInternalDeadline) }}
        </DsBadge>
      </div>

      <p class="gks-uni__intake-note">
        Бүртгэлийн эцсийн хугацаа хүртэл хэдийд ч бүртгүүлэх боломжтой. Материал бүрдүүлэх,
        орчуулах хугацаа шаардагддаг тул эрт эхлэх тусам сайн.
      </p>

      <div v-for="[level, terms] in intakesByLevel" :key="level" class="gks-uni__intake-group">
        <h4 class="gks-uni__intake-title">{{ PROGRAM_LEVEL_LABELS[level] }}</h4>
        <div class="gks-uni__scroll">
          <table class="gks-table gks-uni__intake-table">
            <thead>
              <tr>
                <th scope="col">Элсэлт</th>
                <th scope="col">Бүртгэлийн эцсийн хугацаа</th>
                <th scope="col">Хичээл эхлэх</th>
                <th scope="col"><span class="gks-sr-only">Үйлдэл</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="term in terms" :key="term.id">
                <td>
                  <span class="gks-tnum">
                    {{ term.year }} · {{ INTAKE_MONTH_LABELS[term.month] ?? `${term.month}-р сар` }}
                  </span>
                  <small v-if="term.requirementNote" class="gks-uni__cell-note">
                    {{ term.requirementNote }}
                  </small>
                </td>
                <td>
                  <span class="gks-tnum gks-uni__intake-ours">
                    {{ formatNumericDateUtc(term.internalDeadline) }}
                  </span>
                  <small v-if="term.phase !== 'CLOSED'" class="gks-uni__cell-note">
                    {{ countdownLabel(term.daysUntilInternalDeadline) }}
                  </small>
                </td>
                <td class="gks-tnum">{{ formatNumericDateUtc(term.classStartDate) }}</td>
                <td class="gks-uni__intake-action">
                  <NuxtLink
                    v-if="term.phase !== 'CLOSED'"
                    class="gks-uni__intake-cta"
                    :to="{ path: '/app/start', query: { universityId: uni.id, intakeId: term.id } }"
                  >
                    Бүртгүүлэх
                  </NuxtLink>
                  <DsBadge v-else tone="neutral">{{ INTAKE_PHASE_LABELS[term.phase] }}</DsBadge>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p v-for="note in intakeNotes" :key="note" class="gks-uni__note">{{ note }}</p>
    </DsCard>

    <!-- 2 · Анги. Сургууль → танхим → анги, with the price the school publishes. -->
    <DsCard v-if="uni.programs.length" title="Анги, сургалтын төлбөр">
      <template #action>
        <NuxtLink class="gks-uni__more" :to="{ path: '/programs', query: { university: uni.slug } }">
          Бүх анги <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </template>

      <div v-for="group in programsByFaculty" :key="group.key" class="gks-uni__faculty">
        <h4 v-if="group.faculty" class="gks-uni__faculty-title">
          {{ group.faculty.nameMn }}
          <span v-if="facultyNativeName(group.faculty)">{{ facultyNativeName(group.faculty) }}</span>
        </h4>
        <ul class="gks-uni__programs">
          <li v-for="program in group.programs" :key="program.id" class="gks-uni__program">
            <div class="gks-uni__program-name">
              <span class="gks-uni__level">{{ PROGRAM_LEVEL_LABELS[program.level] }}</span>
              <strong>{{ program.nameMn }}</strong>
              <small v-if="programNativeName(program)">{{ programNativeName(program) }}</small>
              <p class="gks-uni__program-meta">
                <span v-for="item in programMeta(program)" :key="item">{{ item }}</span>
              </p>
              <p v-if="program.scholarshipMaxPercent" class="gks-uni__program-scholarship">
                <DsIcon name="badge-percent" :size="14" />
                Гадаад оюутанд <strong>{{ program.scholarshipMaxPercent }}% хүртэл</strong> хөнгөлөлт
                <span v-if="program.scholarshipNote">— {{ program.scholarshipNote }}</span>
              </p>
            </div>
            <!-- Korean schools publish a semester price; the annual figure is
                 derived at the point of display, never written down. -->
            <div class="gks-uni__program-price">
              <strong v-if="annualTuitionKrw(program) !== null" class="gks-tnum">
                {{ formatKrw(annualTuitionKrw(program)) }}
              </strong>
              <strong v-else class="gks-uni__unknown">{{ UNKNOWN_LABEL }}</strong>
              <small v-if="annualTuitionKrw(program) !== null">
                жилд · {{ tuitionYearLabel(program.tuitionYear) }}
              </small>
              <small v-if="program.tuitionPerTermKrw" class="gks-tnum">
                улирал {{ formatKrw(program.tuitionPerTermKrw) }}
              </small>
              <small v-if="program.admissionFeeKrw" class="gks-tnum">
                элсэлтийн хураамж {{ formatKrw(program.admissionFeeKrw) }}
              </small>
            </div>
          </li>
        </ul>
      </div>
    </DsCard>

    <!-- Neither yet: say so once, instead of two empty tables. -->
    <DsCard v-if="!uni.intakes.length && !uni.programs.length">
      <p class="gks-uni__empty">
        Энэ сургуулийн элсэлтийн хугацаа, ангиудын мэдээллийг бид бүрдүүлж байна.
        <NuxtLink :to="`/consultation?university=${uni.slug}`">Зөвлөгөө авах хүсэлт</NuxtLink>
        үлдээвэл мэргэжилтэн тань сургуулиас тодруулж хариу өгнө.
      </p>
    </DsCard>

    <!-- 3 · Давуу тал: why this school, in the office's own words. -->
    <DsCard v-if="uni.advantages?.length" title="Давуу тал">
      <template #action>
        <DsBadge tone="info" icon="pencil">Редакцийн</DsBadge>
      </template>
      <ul class="gks-uni__advantages">
        <li v-for="item in uni.advantages" :key="item">
          <DsIcon name="check" :size="16" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </DsCard>

    <div class="gks-uni__grid">
      <!-- 4 · The spec sheet, and where the school's own pages are. -->
      <DsCard v-if="facts.length || links.length" title="Сургуулийн мэдээлэл">
        <dl v-if="facts.length">
          <CommonDataValue
            v-for="fact in facts"
            :key="fact.label"
            :label="fact.label"
            :value="fact.value"
            :source="fact.source"
          />
        </dl>
        <div v-if="links.length" class="gks-uni__links">
          <a
            v-for="link in links"
            :key="link.key"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
            class="gks-uni__link"
          >
            {{ link.label }}
            <DsIcon name="external-link" :size="14" />
          </a>
        </div>
      </DsCard>

      <!-- 5 · Зардал. -->
      <DsCard v-if="monthlyTotal || costRows.length || dormitoryRows.length" title="Амьжиргааны зардал">
        <template #action>
          <DsBadge v-if="cost?.isEstimate" tone="warning" icon="circle-help">Тооцоолсон</DsBadge>
        </template>
        <p v-if="cost?.tierLabelMn" class="gks-uni__tier">{{ cost.tierLabelMn }}</p>
        <p v-if="monthlyTotal" class="gks-uni__total">
          <span class="gks-tnum">{{ monthlyTotal }}</span>
          <span class="gks-uni__total-unit">/ сар</span>
        </p>
        <dl v-if="costRows.length">
          <CommonDataValue
            v-for="row in costRows"
            :key="row.label"
            :label="row.label"
            :value="row.value"
          />
        </dl>
        <template v-if="dormitoryRows.length">
          <h4 class="gks-uni__subtitle">Дотуур байр</h4>
          <dl>
            <CommonDataValue
              v-for="row in dormitoryRows"
              :key="row.label"
              :label="row.label"
              :value="row.value"
            />
          </dl>
        </template>
        <p v-if="cost?.note" class="gks-uni__note">{{ cost.note }}</p>
      </DsCard>
    </div>

    <DsCard accent class="gks-uni__foot">
      <div class="gks-uni__foot-inner">
        <div>
          <h3 class="gks-uni__foot-title">Энэ сургуульд элсэх сонирхолтой юу?</h3>
          <p class="gks-uni__foot-text">
            Зөвлөгөөний хүсэлт үлдээгээрэй — мэргэжилтэн тань шаардлагатай материал,
            хугацаа, зардлыг тодруулж өгнө.
          </p>
        </div>
        <DsButton variant="accent" icon-right="arrow-right" @click="navigateTo(`/consultation?university=${uni.slug}`)">
          Зөвлөгөө авах
        </DsButton>
      </div>
    </DsCard>
  </article>
</template>

<style scoped>
.gks-uni { display: flex; flex-direction: column; gap: var(--sp-5); }

.gks-uni__crumbs {
  display: flex;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}
.gks-uni__crumbs a { color: var(--text-link); text-decoration: none; }
.gks-uni__crumbs a:hover { color: var(--text-link-hover); }

/* ---- Hero ---- */
.gks-uni__hero {
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-raised);
  padding: var(--sp-6);
}
.gks-uni__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-5);
}
.gks-uni__logo {
  width: 88px;
  height: 88px;
  object-fit: contain;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  padding: var(--sp-2);
}
.gks-uni__logo--empty {
  display: grid;
  place-items: center;
  background: var(--surface-sunken);
  color: var(--text-subtle);
}
.gks-uni__identity { min-width: 0; }
.gks-uni__title {
  font-family: var(--font-display);
  font-size: clamp(24px, 3vw, var(--fs-h1));
  font-weight: var(--fw-bold);
  line-height: var(--lh-heading);
  letter-spacing: var(--ls-heading);
}
.gks-uni__names { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-uni__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-uni__cta { display: flex; flex-direction: column; align-items: stretch; gap: var(--sp-2); }

.gks-uni__lede {
  max-width: var(--container-prose);
  margin-top: var(--sp-5);
  line-height: var(--lh-body);
  color: var(--text-body);
}

/* The identity numbers, on their own ground so they read as a set. The tiles
   are separated by their own borders rather than by a gap over a coloured
   ground: a row that does not divide evenly then leaves plain tile-coloured
   space instead of a stripe of leftover background. */
.gks-uni__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  margin-top: var(--sp-5);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
  overflow: hidden;
}
.gks-uni__stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--sp-4);
  border-left: var(--border-hair) solid var(--line-soft);
}
.gks-uni__stat:first-child { border-left: 0; }
.gks-uni__stat-label {
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-uni__stat-value {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  font-variant-numeric: var(--num-tabular);
  color: var(--text-strong);
}
.gks-uni__stat-hint { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-uni__rank-note {
  max-width: var(--container-prose);
  margin-top: var(--sp-3);
  font-size: var(--fs-caption);
  line-height: 1.6;
  color: var(--text-subtle);
}

/* ---- Sections ---- */
.gks-uni__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-5);
  align-items: start;
}

.gks-uni__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--brand-700);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
}
.gks-uni__subtitle {
  margin: var(--sp-5) 0 var(--sp-1);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-uni__unknown { font-weight: var(--fw-regular); font-style: italic; color: var(--text-subtle); }
.gks-uni__note {
  margin-top: var(--sp-4);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-subtle);
}
.gks-uni__empty { line-height: var(--lh-body); color: var(--text-muted); }
.gks-uni__empty a { color: var(--brand-700); font-weight: var(--fw-semibold); }

.gks-uni__links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.gks-uni__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--text-link);
}
.gks-uni__link:hover { color: var(--text-link-hover); }

/* ---- Элсэлт ---- */
.gks-uni__next {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--brand-100);
  border-radius: var(--radius-2);
  background: var(--brand-025);
}
.gks-uni__next-label {
  display: block;
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-uni__next-date {
  display: block;
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  color: var(--brand-800);
}
.gks-uni__next-term { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-uni__intake-note {
  margin-top: var(--sp-4);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  line-height: 1.6;
}
.gks-uni__intake-group { margin-top: var(--sp-5); }
.gks-uni__intake-title { font-size: var(--fs-label); font-weight: var(--fw-semibold); }
/* A wide table must scroll inside its own box, never the page. */
.gks-uni__scroll { margin-top: var(--sp-2); overflow-x: auto; }
.gks-uni__intake-table { min-width: 520px; font-size: var(--fs-caption); }
/* The date a client actually has to hit — ours, never the school's. */
.gks-uni__intake-ours { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-uni__intake-action { text-align: right; white-space: nowrap; }
.gks-uni__intake-cta { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-uni__cell-note {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}

.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-table th {
  text-align: left;
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-table td {
  padding: var(--sp-3);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-table tbody tr:last-child td { border-bottom: 0; }

/* ---- Анги ---- */
.gks-uni__faculty + .gks-uni__faculty { margin-top: var(--sp-6); }
.gks-uni__faculty-title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  padding-bottom: var(--sp-2);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-uni__faculty-title span { font-size: var(--fs-caption); font-weight: var(--fw-regular); color: var(--text-subtle); }

.gks-uni__programs { display: grid; }
.gks-uni__program {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-4) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-uni__program:last-child { border-bottom: 0; }
.gks-uni__program-name { min-width: 0; }
/* Direct child only — the discount sentence below carries a <strong> of its
   own, and it has to stay inline in the running text. */
.gks-uni__program-name > strong {
  display: block;
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-uni__program-name > small {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}
.gks-uni__level {
  display: inline-flex;
  margin-bottom: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
}
.gks-uni__program-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-2);
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-uni__program-meta span + span::before {
  content: '·';
  margin-right: var(--sp-2);
  color: var(--text-disabled);
}
/* Plain text flow, not a flex row: the condition on a discount is a sentence
   and has to wrap as one on a narrow screen. */
.gks-uni__program-scholarship {
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  line-height: 1.5;
  color: var(--green-700);
}
.gks-uni__program-scholarship svg { vertical-align: -2px; margin-right: 4px; }
.gks-uni__program-price {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
.gks-uni__program-price strong {
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  font-variant-numeric: var(--num-tabular);
  color: var(--text-strong);
}
.gks-uni__program-price small { font-size: var(--fs-micro); color: var(--text-subtle); }

/* ---- Давуу тал ---- */
.gks-uni__advantages {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: var(--sp-3) var(--sp-6);
}
.gks-uni__advantages li {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  line-height: var(--lh-body);
  color: var(--text-body);
}
.gks-uni__advantages svg { color: var(--green-600); flex: none; margin-top: 4px; }

/* ---- Зардал ---- */
.gks-uni__tier { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-uni__total {
  margin: var(--sp-2) 0 var(--sp-4);
  font-size: var(--fs-h3);
  font-weight: var(--fw-bold);
  font-variant-numeric: var(--num-tabular);
  color: var(--text-strong);
}
.gks-uni__total-unit {
  margin-left: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-regular);
  color: var(--text-subtle);
}

/* ---- Foot ---- */
.gks-uni__foot-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  flex-wrap: wrap;
}
.gks-uni__foot-title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-uni__foot-text { margin-top: var(--sp-2); color: var(--text-muted); max-width: 60ch; }

@media (max-width: 640px) {
  /* Two per row rather than three cramped ones. */
  .gks-uni__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gks-uni__stat { border-left: 0; }
  .gks-uni__stat:nth-child(even) { border-left: var(--border-hair) solid var(--line-soft); }
  .gks-uni__stat:nth-child(n+3) { border-top: var(--border-hair) solid var(--line-soft); }
}

@media (max-width: 900px) {
  .gks-uni__head { grid-template-columns: auto minmax(0, 1fr); }
  .gks-uni__cta { grid-column: 1 / -1; }
  .gks-uni__grid { grid-template-columns: minmax(0, 1fr); }
  .gks-uni__program { flex-direction: column; gap: var(--sp-2); }
  .gks-uni__program-price { align-items: flex-start; text-align: left; }
}
</style>
