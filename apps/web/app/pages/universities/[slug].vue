<script setup lang="ts">
import type { IntakeTerm, ProgramLevel, UniversityDetail } from '@gks/shared';

/** University detail: six blocks — intro, location, metrics, dormitory, cost, advantages (1A-07). */
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
async function onToggleSaved() {
  savePending.value = true;
  try {
    await toggleSaved(uni.value.id);
  } finally {
    savePending.value = false;
  }
}

const cost = computed(() => uni.value.livingCost);
const costRows = computed(() => {
  const c = cost.value;
  if (!c) return [];
  const range = (pair?: [number, number] | null) =>
    pair ? formatKrwRange(pair[0], pair[1]) : null;
  return [
    { label: 'Орон сууц / байр', value: range(c.housing) },
    { label: 'Хоол', value: range(c.food) },
    { label: 'Тээвэр', value: range(c.transport) },
    { label: 'Бусад', value: range(c.other) },
  ];
});

const dormitory = computed(() => uni.value.dormitory);

/**
 * Times Higher Education's South Korea table — the base rank (1A-28).
 *
 * Only 41 Korean universities appear in it against the 135 we carry, so a
 * missing rank is stated as "рэйтингд ороогүй" rather than left to the generic
 * "мэдээлэл шинэчлэгдэж байна": we are not waiting on this number, the school
 * genuinely is not in the table.
 */
const THE_RANKED_KOREAN_UNIVERSITIES = 41;
const theRankedTotal = THE_RANKED_KOREAN_UNIVERSITIES;

const rankingTitle = computed(() =>
  uni.value.theRankYear ? `Олон улсын рэйтинг · ${uni.value.theRankYear}` : 'Олон улсын рэйтинг',
);
const koreaRankLabel = computed(() =>
  uni.value.theKoreaRank ? `Солонгост #${uni.value.theKoreaRank}` : 'Рэйтингд ороогүй',
);
const worldRankLabel = computed(() =>
  uni.value.theWorldRank ? `Дэлхийд ${uni.value.theWorldRank}` : 'Рэйтингд ороогүй',
);

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

/** `null` is "мэдээлэл шинэчлэгдэж байна", never a guessed date (CLAUDE.md). */
function formatIntakeDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

useHead({
  // Schools are named in English across the whole public site — the Mongolian
  // transliteration varies between sources, while the English name is what a
  // visitor can match against the school's own site and paperwork.
  title: () => uni.value.nameEn,
  // JSON-LD (1A-19) — one university per page, so a static computed script is enough.
  script: [
    {
      type: 'application/ld+json',
      innerHTML: () =>
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'EducationalOrganization',
          // `name` tracks the visible <h1>; the other two are alternates.
          name: uni.value.nameEn,
          alternateName: [uni.value.nameMn, uni.value.nameKo],
          address: {
            '@type': 'PostalAddress',
            addressLocality: uni.value.cityEn,
            addressRegion: uni.value.regionEn,
            addressCountry: 'KR',
          },
          url: uni.value.links?.officialWebsite ?? undefined,
          logo: uni.value.logoPath ?? undefined,
        }),
    },
  ],
});
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

    <header class="gks-uni__head">
      <img
        v-if="uni.logoPath"
        :src="uni.logoPath"
        :alt="`${uni.nameEn} лого`"
        class="gks-uni__logo"
        width="88"
        height="88"
      >
      <div>
        <h1 class="gks-uni__title">{{ uni.nameEn }}</h1>
        <p class="gks-uni__names">{{ uni.nameMn }} · {{ uni.nameKo }}</p>
        <div class="gks-uni__tags">
          <DsBadge tone="neutral">{{ UNIVERSITY_TYPE_LABELS[uni.type] }}</DsBadge>
          <DsBadge tone="neutral" icon="map-pin">{{ uni.cityMn }}, {{ uni.regionMn }}</DsBadge>
          <DsBadge v-if="uni.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл авдаг</DsBadge>
          <DsBadge v-if="uni.isGksEligible" tone="accent">GKS тэтгэлэг</DsBadge>
          <DsBadge v-if="uni.theKoreaRank" tone="neutral" icon="trophy">
            Солонгост #{{ uni.theKoreaRank }}
          </DsBadge>
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
        <a
          v-if="uni.links?.officialWebsite"
          :href="uni.links.officialWebsite"
          target="_blank"
          rel="noopener noreferrer"
          class="gks-uni__link"
        >
          Албан ёсны вебсайт
          <DsIcon name="external-link" :size="14" />
        </a>
      </div>
    </header>

    <div class="gks-uni__grid">
      <!-- 1 · Танилцуулга -->
      <DsCard title="Танилцуулга" class="gks-uni__wide">
        <p v-if="uni.detailedIntroMn" class="gks-uni__prose">{{ uni.detailedIntroMn }}</p>
        <p v-else-if="uni.shortIntroMn" class="gks-uni__prose">{{ uni.shortIntroMn }}</p>
        <p v-else class="gks-uni__unknown">{{ UNKNOWN_LABEL }}</p>
      </DsCard>

      <!-- 2 · Байршил -->
      <DsCard title="Байршил">
        <dl>
          <CommonDataValue label="Хот" :value="uni.cityMn" :source="quality.city" />
          <CommonDataValue label="Бүс нутаг" :value="uni.regionMn" />
          <CommonDataValue label="Хаяг" :value="uni.address" />
          <CommonDataValue
            label="Сөүлээс"
            :value="uni.distanceFromSeoulKm ? `${uni.distanceFromSeoulKm} км` : null"
          />
          <CommonDataValue label="Замын хугацаа" :value="uni.travelTimeFromSeoul" />
          <CommonDataValue label="Ойр метро / автобус" :value="uni.nearestTransit" />
        </dl>
        <a
          v-if="uni.links?.googleMaps"
          :href="uni.links.googleMaps"
          target="_blank"
          rel="noopener noreferrer"
          class="gks-uni__link gks-uni__link--block"
        >
          Газрын зураг дээр харах
          <DsIcon name="external-link" :size="14" />
        </a>
      </DsCard>

      <!-- 3 · Үзүүлэлт -->
      <DsCard title="Үзүүлэлт">
        <dl>
          <CommonDataValue
            label="Байгуулагдсан"
            :value="uni.foundedYear ? `${uni.foundedYear} он` : null"
            :source="quality.founded"
          />
          <CommonDataValue
            label="Оюутны тоо"
            :value="formatNumber(uni.studentsTotal)"
            :source="quality.students"
          />
          <CommonDataValue label="Гадаад оюутан" :value="formatNumber(uni.internationalStudents)" />
          <CommonDataValue label="Монгол оюутан" :value="formatNumber(uni.mongolianStudents)" />
          <CommonDataValue label="Кампусын тоо" :value="formatNumber(uni.numCampuses)" />
          <CommonDataValue label="Кампусын орчин" :value="uni.campusInfo" />
        </dl>
      </DsCard>

      <!-- 3b · Олон улсын рэйтинг (Times Higher Education) -->
      <DsCard :title="rankingTitle">
        <dl>
          <CommonDataValue label="Солонгосын эрэмбэ" :value="koreaRankLabel" />
          <CommonDataValue label="Дэлхийн эрэмбэ" :value="worldRankLabel" />
        </dl>
        <p class="gks-uni__rank-note">
          Эх сурвалж: Times Higher Education. Солонгосын {{ theRankedTotal }} их сургууль
          энэ жагсаалтад багтдаг тул түүнд ороогүй нь чанар муу гэсэн үг биш.
        </p>
      </DsCard>

      <!-- 4 · Дотуур байр -->
      <DsCard title="Дотуур байр">
        <dl>
          <CommonDataValue
            label="Дотуур байртай эсэх"
            :value="dormitory?.available === null || dormitory?.available === undefined
              ? null
              : dormitory.available ? 'Тийм' : 'Үгүй'"
          />
          <CommonDataValue label="Сарын төлбөр" :value="formatKrw(dormitory?.pricePerMonthKrw)" />
          <CommonDataValue label="Улирлын төлбөр" :value="formatKrw(dormitory?.pricePerSemesterKrw)" />
          <CommonDataValue label="Барьцаа" :value="formatKrw(dormitory?.depositKrw)" />
        </dl>
        <p v-if="dormitory?.note" class="gks-uni__note">{{ dormitory.note }}</p>
      </DsCard>

      <!-- 5 · Амьжиргааны зардал -->
      <DsCard title="Амьжиргааны зардал">
        <template #action>
          <DsBadge v-if="cost?.isEstimate" tone="warning" icon="circle-help">Тооцоолсон</DsBadge>
        </template>
        <p v-if="cost?.tierLabelMn" class="gks-uni__tier">{{ cost.tierLabelMn }}</p>
        <p class="gks-uni__total">
          <span class="gks-tnum">
            {{ formatKrwRange(cost?.monthlyTotalMin, cost?.monthlyTotalMax) ?? UNKNOWN_LABEL }}
          </span>
          <span class="gks-uni__total-unit">/ сар</span>
        </p>
        <dl>
          <CommonDataValue v-for="row in costRows" :key="row.label" :label="row.label" :value="row.value" />
        </dl>
        <p v-if="cost?.note" class="gks-uni__note">{{ cost.note }}</p>
      </DsCard>

      <!-- 6 · Давуу тал -->
      <DsCard v-if="uni.advantages?.length" title="Давуу тал" class="gks-uni__wide">
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

      <!-- Хөтөлбөр ба элсэлт — ажилтнууд бөглөх тусам харагдана -->
      <DsCard v-if="uni.programs.length" title="Хөтөлбөрүүд" class="gks-uni__wide">
        <table class="gks-table">
          <thead>
            <tr>
              <th>Түвшин</th>
              <th>Хөтөлбөр</th>
              <th>Хугацаа</th>
              <th>Хэлний шаардлага</th>
              <th>Төлбөр / жил</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="program in uni.programs" :key="program.id">
              <td>{{ PROGRAM_LEVEL_LABELS[program.level] }}</td>
              <td>{{ program.nameMn }}</td>
              <td class="gks-tnum">{{ program.durationYears ? `${program.durationYears} жил` : '—' }}</td>
              <td>
                <span v-if="program.topikLevel">TOPIK {{ program.topikLevel }}</span>
                <span v-else-if="program.ieltsScore">IELTS {{ program.ieltsScore }}</span>
                <span v-else>—</span>
              </td>
              <td class="gks-tnum">{{ formatKrw(program.tuitionPerYearKrw) ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </DsCard>

      <DsCard v-if="intakesByLevel.length" title="Элсэлтийн хугацаа" class="gks-uni__wide">
        <template #action>
          <NuxtLink class="gks-uni__intake-all" :to="{ path: '/admissions', query: { q: uni.nameEn } }">
            Бүх элсэлт
          </NuxtLink>
        </template>
        <p class="gks-uni__intake-note">
          Бүртгэлийн эцсийн хугацаа хүртэл хэдийд ч бүртгүүлэх боломжтой. Материал бүрдүүлэх,
          орчуулах хугацаа шаардагддаг тул эрт эхлэх тусам сайн.
        </p>
        <div v-for="[level, terms] in intakesByLevel" :key="level" class="gks-uni__intake-group">
          <h4 class="gks-uni__intake-title">{{ PROGRAM_LEVEL_LABELS[level] }}</h4>
          <div class="gks-uni__intake-scroll">
            <table class="gks-table gks-uni__intake-table">
              <thead>
                <tr>
                  <th scope="col">Элсэлт</th>
                  <th scope="col">Бүртгэлийн эцсийн хугацаа</th>
                  <th scope="col">Хичээл эхлэх</th>
                  <th scope="col">Төлөв</th>
                  <th scope="col"><span class="gks-sr-only">Үйлдэл</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="term in terms" :key="term.id">
                  <td class="gks-tnum">
                    {{ term.year }} · {{ INTAKE_MONTH_LABELS[term.month] ?? `${term.month}-р сар` }}
                  </td>
                  <td class="gks-tnum gks-uni__intake-ours">{{ formatIntakeDate(term.internalDeadline) }}</td>
                  <td class="gks-tnum">{{ formatIntakeDate(term.classStartDate) }}</td>
                  <td>
                    <DsBadge :tone="INTAKE_PHASE_TONE[term.phase]">{{ INTAKE_PHASE_LABELS[term.phase] }}</DsBadge>
                  </td>
                  <td>
                    <NuxtLink
                      v-if="term.phase !== 'CLOSED'"
                      class="gks-uni__intake-cta"
                      :to="{ path: '/app/start', query: { universityId: uni.id, intakeId: term.id } }"
                    >
                      Бүртгүүлэх
                    </NuxtLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
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
.gks-uni__rank-note {
  margin-top: var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}

.gks-uni { display: flex; flex-direction: column; gap: var(--sp-6); }

.gks-uni__crumbs {
  display: flex;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}
.gks-uni__crumbs a { color: var(--text-link); text-decoration: none; }
.gks-uni__crumbs a:hover { color: var(--text-link-hover); }

.gks-uni__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--sp-5);
  padding-bottom: var(--sp-6);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-uni__logo {
  width: 88px;
  height: 88px;
  object-fit: contain;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  padding: var(--sp-2);
}
.gks-uni__title {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  line-height: var(--lh-heading);
  letter-spacing: var(--ls-heading);
}
.gks-uni__names { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-uni__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-uni__cta { display: flex; flex-direction: column; align-items: flex-end; gap: var(--sp-2); }
.gks-uni__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--text-link);
}
.gks-uni__link:hover { color: var(--text-link-hover); }
.gks-uni__link--block { margin-top: var(--sp-4); }

.gks-uni__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
  align-items: start;
}
.gks-uni__wide { grid-column: 1 / -1; }

.gks-uni__prose { line-height: var(--lh-body); color: var(--text-body); }
.gks-uni__unknown { font-style: italic; color: var(--text-subtle); }
.gks-uni__note {
  margin-top: var(--sp-4);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-subtle);
}
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

.gks-uni__advantages { display: grid; gap: var(--sp-3); }
.gks-uni__advantages li {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  line-height: var(--lh-body);
  color: var(--text-body);
}
.gks-uni__advantages svg { color: var(--green-600); flex: none; margin-top: 3px; }

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

.gks-uni__intake-group + .gks-uni__intake-group { margin-top: var(--sp-5); }
.gks-uni__intake-title { font-size: var(--fs-label); font-weight: var(--fw-semibold); }
.gks-uni__intake-note { margin-bottom: var(--sp-4); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-uni__intake-note strong { color: var(--text-body); }
.gks-uni__intake-all { color: var(--brand-700); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
/* A wide table must scroll inside its own box, never the page. */
.gks-uni__intake-scroll { margin-top: var(--sp-3); overflow-x: auto; }
.gks-uni__intake-table { min-width: 560px; font-size: var(--fs-caption); }
/* The date a client actually has to hit. */
.gks-uni__intake-ours { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-uni__intake-cta { color: var(--brand-700); font-weight: var(--fw-semibold); white-space: nowrap; }

.gks-uni__foot-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  flex-wrap: wrap;
}
.gks-uni__foot-title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-uni__foot-text { margin-top: var(--sp-2); color: var(--text-muted); max-width: 60ch; }

@media (max-width: 900px) {
  .gks-uni__head { grid-template-columns: auto minmax(0, 1fr); }
  .gks-uni__cta { grid-column: 1 / -1; align-items: stretch; }
  .gks-uni__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
