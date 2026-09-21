<script setup lang="ts">
import type {
  CatalogueCheck,
  CatalogueProgress,
  CatalogueProgressRow,
  CatalogueProgressStatus,
  ProgramLevel,
} from '@gks/shared';

/**
 * 1A-43 — how far the office has got filling in the 135 schools, on one screen.
 *
 * The list pages each show one table's rows; none of them can say "Ajou has
 * programmes but no intakes" or "nobody has touched 120 schools yet". This
 * page reads every school against the same five checks, and next to it who on
 * the team has been doing the work, so a manager can see both without opening
 * a single school.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Мэдээлэл бэлтгэлийн явц · Админ' });

const api = useApi();

const CHECKS: CatalogueCheck[] = ['intakes', 'programs', 'faculties', 'tuition', 'scholarship'];
const LEVELS: ProgramLevel[] = ['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'];

const PERIOD_OPTIONS = [
  { value: '7', label: 'Сүүлийн 7 хоног' },
  { value: '30', label: 'Сүүлийн 30 хоног' },
  { value: '90', label: 'Сүүлийн 90 хоног' },
  { value: '365', label: 'Сүүлийн 1 жил' },
];
const GAP_OPTIONS = [
  { value: '', label: 'Бүх сургууль' },
  ...CHECKS.map((check) => ({ value: check, label: `${CATALOGUE_CHECK_LABELS[check]} дутуу` })),
];
const SORT_OPTIONS = [
  { value: 'percent:asc', label: 'Дутуугаас нь' },
  { value: 'percent:desc', label: 'Бүрэнгээс нь' },
  { value: 'activity:desc', label: 'Сүүлд засварласан' },
  { value: 'name:asc', label: 'Нэрээр' },
];

const periodDays = ref('30');
const q = ref('');
const status = ref<CatalogueProgressStatus | ''>('');
const gap = ref<CatalogueCheck | ''>('');
const sort = ref('percent:asc');

const data = ref<CatalogueProgress | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    data.value = await api.get<CatalogueProgress>('/admin/universities/progress', {
      query: { days: periodDays.value },
    });
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Явцын мэдээллийг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

onMounted(load);
watch(periodDays, load);

const summary = computed(() => data.value?.summary ?? null);

const rows = computed(() => {
  const needle = q.value.trim().toLowerCase();
  const [key, direction] = sort.value.split(':');
  const sign = direction === 'desc' ? -1 : 1;

  return (data.value?.rows ?? [])
    .filter((row) => !status.value || row.status === status.value)
    .filter((row) => !gap.value || row.checks[gap.value] < 1)
    .filter(
      (row) =>
        !needle || [row.nameEn, row.nameMn, row.nameKo, row.slug].some((name) => name.toLowerCase().includes(needle)),
    )
    .sort((a, b) => {
      if (key === 'name') return universityName(a).localeCompare(universityName(b));
      if (key === 'activity') return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '');
      return sign * (a.percent - b.percent) || universityName(a).localeCompare(universityName(b));
    });
});

/** "Элсэлт: 6 / 135 сургууль" — one bar per check. */
const checkBars = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return CHECKS.map((check) => ({
    key: check,
    label: CATALOGUE_CHECK_LABELS[check],
    value: s.checksComplete[check],
    note: `${s.checksComplete[check]} / ${s.schools}`,
  }));
});

/** Intake and programme coverage per level, over the schools that expect it. */
const levelRows = computed(() => {
  const s = summary.value;
  if (!s) return [];
  return LEVELS.map((level) => ({ level, ...s.levels[level] }));
});

function share(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : '—';
}

function levelCell(row: CatalogueProgressRow, level: ProgramLevel) {
  return row.levels.find((cell) => cell.level === level)!;
}

/** Fully met, partly met, or missing — the colour of each small fraction on a row. */
function checkTone(value: number): 'ok' | 'part' | 'none' {
  return value >= 1 ? 'ok' : value > 0 ? 'part' : 'none';
}

function openSchool(row: CatalogueProgressRow) {
  navigateTo(`/admin/universities/${row.id}`);
}

const staffTotal = (member: CatalogueProgress['staff'][number]) =>
  member.programsCreated +
  member.programsUpdated +
  member.intakesCreated +
  member.intakesUpdated +
  member.facultiesChanged +
  member.universitiesUpdated +
  member.deleted;
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-page__title">Мэдээлэл бэлтгэлийн явц</h1>
        <p class="gks-page__hint">
          Сургууль бүрийн элсэлт, анги, танхим, төлбөр, тэтгэлгийн мэдээлэл хэр бөглөгдсөн, хэн юу
          хийсэн. Бакалавр, магистрт бүх сургуулиас, хэлний бэлтгэлд зөвхөн хэлний бэлтгэлтэй
          сургуулиас шаардана; докторыг тоолно, харин шаардахгүй.
        </p>
      </div>
      <div class="gks-page__actions">
        <DsSelect v-model="periodDays" :options="PERIOD_OPTIONS" aria-label="Ажилтны идэвхийн хугацаа" />
      </div>
    </header>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 8" :key="n" class="gks-skeleton__row" />
    </div>

    <template v-else-if="data && summary">
      <section class="gks-stats" aria-label="Явцын тойм">
        <div class="gks-stat">
          <span>Нийт сургууль</span><strong class="gks-tnum">{{ summary.schools }}</strong>
        </div>
        <div class="gks-stat gks-stat--success">
          <span>Бүрэн</span><strong class="gks-tnum">{{ summary.byStatus.DONE }}</strong>
        </div>
        <div class="gks-stat gks-stat--warn">
          <span>Хийгдэж байна</span><strong class="gks-tnum">{{ summary.byStatus.IN_PROGRESS }}</strong>
        </div>
        <div class="gks-stat gks-stat--danger">
          <span>Эхлээгүй</span><strong class="gks-tnum">{{ summary.byStatus.NOT_STARTED }}</strong>
        </div>
        <div class="gks-stat">
          <span>Дундаж бүрэн байдал</span><strong class="gks-tnum">{{ summary.averagePercent }}%</strong>
        </div>
      </section>

      <div class="gks-progress__grid">
        <DsCard title="Шалгуур тус бүрээр бүрэн болсон сургууль">
          <ReportsBarList :rows="checkBars" />
          <p class="gks-progress__foot gks-tnum">
            Нийт {{ summary.programs.total }} анги — төлбөртэй
            {{ share(summary.programs.withTuition, summary.programs.total) }}, тэтгэлгийн мэдээлэлтэй
            {{ summary.programs.withScholarship }}, хянасан {{ summary.programs.verified }}.
            Ирэх элсэлт {{ summary.intakes.upcoming }}, үүнээс хянасан {{ summary.intakes.verified }}.
          </p>
        </DsCard>

        <DsCard title="Түвшин тус бүрээр">
          <table class="gks-table gks-progress__levels">
            <thead>
              <tr>
                <th>Түвшин</th>
                <th class="gks-table__num">Шаардлагатай</th>
                <th class="gks-table__num">Элсэлттэй</th>
                <th class="gks-table__num">Ангитай</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in levelRows" :key="entry.level">
                <td>{{ PROGRAM_LEVEL_LABELS[entry.level] }}</td>
                <td class="gks-table__num gks-tnum">{{ entry.expected || '—' }}</td>
                <td class="gks-table__num gks-tnum">
                  {{ entry.withIntake }}
                  <small v-if="entry.expected" class="gks-muted">{{ share(entry.withIntake, entry.expected) }}</small>
                </td>
                <td class="gks-table__num gks-tnum">
                  {{ entry.withPrograms }}
                  <small v-if="entry.expected" class="gks-muted">{{ share(entry.withPrograms, entry.expected) }}</small>
                </td>
              </tr>
            </tbody>
          </table>
        </DsCard>
      </div>

      <DsCard :title="`Ажилтнуудын хийсэн ажил — ${PERIOD_OPTIONS.find((o) => o.value === periodDays)?.label.toLowerCase()}`">
        <p v-if="!data.staff.length" class="gks-muted">Энэ хугацаанд каталог дээр ажилласан бүртгэл алга.</p>
        <div v-else class="gks-table-wrap">
          <table class="gks-table gks-table--cards">
            <thead>
              <tr>
                <th>Ажилтан</th>
                <th class="gks-table__num">Сургууль</th>
                <th class="gks-table__num">Анги нэмсэн</th>
                <th class="gks-table__num">Анги зассан</th>
                <th class="gks-table__num">Элсэлт нэмсэн</th>
                <th class="gks-table__num">Элсэлт зассан</th>
                <th class="gks-table__num">Танхим</th>
                <th class="gks-table__num">Сургууль зассан</th>
                <th class="gks-table__num">Устгасан</th>
                <th class="gks-table__num">Хянасан</th>
                <th class="gks-table__num">AI судалгаа</th>
                <th>Сүүлд</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="member in data.staff" :key="member.actorId ?? member.name">
                <td data-label="Ажилтан">
                  <span class="gks-cell-name">{{ member.name }}</span>
                  <span v-if="member.email && member.email !== member.name" class="gks-cell-sub">{{ member.email }}</span>
                </td>
                <td class="gks-table__num gks-tnum gks-progress__strong" data-label="Сургууль">{{ member.schoolsTouched }}</td>
                <td class="gks-table__num gks-tnum" data-label="Анги нэмсэн">{{ member.programsCreated || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Анги зассан">{{ member.programsUpdated || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Элсэлт нэмсэн">{{ member.intakesCreated || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Элсэлт зассан">{{ member.intakesUpdated || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Танхим">{{ member.facultiesChanged || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Сургууль зассан">{{ member.universitiesUpdated || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Устгасан">{{ member.deleted || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="Хянасан">{{ member.verified || '—' }}</td>
                <td class="gks-table__num gks-tnum" data-label="AI судалгаа">{{ member.researchRuns || '—' }}</td>
                <td class="gks-tnum" data-label="Сүүлд">
                  {{ member.lastActiveAt ? formatRelativeMn(member.lastActiveAt) : '—' }}
                  <small v-if="!staffTotal(member)" class="gks-muted">зөвхөн судалгаа/хяналт</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <details v-if="data.recent.length" class="gks-progress__recent">
          <summary>Сүүлийн {{ data.recent.length }} үйлдэл</summary>
          <ul>
            <li v-for="entry in data.recent" :key="entry.id">
              <span class="gks-tnum gks-muted">{{ formatDateTime(entry.at) }}</span>
              <strong>{{ entry.actorName }}</strong>
              <NuxtLink v-if="entry.university" :to="`/admin/universities/${entry.university.id}`">
                {{ entry.university.nameMn }}
              </NuxtLink>
              <span v-else class="gks-muted">(сургууль тодорхойгүй)</span>
              — {{ CATALOGUE_ACTION_LABELS[entry.action] ?? entry.action }}<template v-if="entry.count > 1"> ({{ entry.count }})</template>
            </li>
          </ul>
        </details>
      </DsCard>

      <DsCard>
        <div class="gks-filters">
          <DsInput
            v-model="q"
            class="gks-filters__search"
            type="search"
            icon-left="search"
            placeholder="Сургуулийн нэрээр хайх…"
          />
          <DsSelect v-model="gap" :options="GAP_OPTIONS" aria-label="Дутуу мэдээлэл" />
          <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
        </div>
        <div class="gks-toggles">
          <DsTag clickable :selected="status === ''" @click="status = ''">Бүгд</DsTag>
          <DsTag
            v-for="key in (['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const)"
            :key="key"
            clickable
            :selected="status === key"
            @click="status = key"
          >
            {{ CATALOGUE_PROGRESS_STATUS_LABELS[key] }} ({{ summary.byStatus[key] }})
          </DsTag>
          <span class="gks-result-count gks-tnum">{{ rows.length }} сургууль</span>
        </div>
      </DsCard>

      <DsCard v-if="!rows.length">Энэ шүүлтүүрт тохирох сургууль алга.</DsCard>

      <div v-else class="gks-table-wrap">
        <table class="gks-table gks-table--cards">
          <thead>
            <tr>
              <th>Сургууль</th>
              <th>Явц</th>
              <th>Элсэлт <small class="gks-muted">(ирэх)</small></th>
              <th>Анги</th>
              <th class="gks-table__num">Танхим</th>
              <th class="gks-table__num">Төлбөр</th>
              <th class="gks-table__num">Тэтгэлэг</th>
              <th class="gks-table__num">Хянасан</th>
              <th>Сүүлд засварласан</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.id"
              class="gks-row"
              tabindex="0"
              @click="openSchool(row)"
              @keydown.enter="openSchool(row)"
            >
              <td data-label="Сургууль">
                <div class="gks-progress__ident">
                  <img v-if="row.logoPath" :src="row.logoPath" alt="" class="gks-progress__logo" loading="lazy">
                  <span v-else class="gks-progress__logo gks-progress__logo--empty" aria-hidden="true">
                    <DsIcon name="school" :size="14" />
                  </span>
                  <span>
                    <span class="gks-cell-name">{{ universityName(row) }}</span>
                    <span class="gks-cell-sub">{{ row.nameMn }}</span>
                  </span>
                </div>
              </td>
              <td data-label="Явц">
                <div class="gks-progress__meter" :title="`${row.percent}%`">
                  <span
                    class="gks-progress__fill"
                    :class="`gks-progress__fill--${row.status}`"
                    :style="{ width: `${row.percent}%` }"
                  />
                </div>
                <span class="gks-progress__pct gks-tnum">{{ row.percent }}%</span>
                <DsBadge :tone="CATALOGUE_PROGRESS_STATUS_TONES[row.status]">
                  {{ CATALOGUE_PROGRESS_STATUS_LABELS[row.status] }}
                </DsBadge>
              </td>
              <td data-label="Элсэлт">
                <div class="gks-progress__levels-cell">
                  <template v-for="level in LEVELS" :key="level">
                    <span
                      v-if="levelCell(row, level).expected || levelCell(row, level).upcomingIntakes"
                      class="gks-progress__chip gks-tnum"
                      :class="{
                        'gks-progress__chip--ok': levelCell(row, level).upcomingIntakes > 0,
                        'gks-progress__chip--none': levelCell(row, level).expected && !levelCell(row, level).upcomingIntakes,
                      }"
                      :title="PROGRAM_LEVEL_LABELS[level]"
                    >
                      {{ PROGRAM_LEVEL_SHORT_LABELS[level] }} {{ levelCell(row, level).upcomingIntakes }}
                    </span>
                  </template>
                </div>
              </td>
              <td data-label="Анги">
                <div class="gks-progress__levels-cell">
                  <template v-for="level in LEVELS" :key="level">
                    <span
                      v-if="levelCell(row, level).expected || levelCell(row, level).programs"
                      class="gks-progress__chip gks-tnum"
                      :class="{
                        'gks-progress__chip--ok': levelCell(row, level).programs > 0,
                        'gks-progress__chip--none': levelCell(row, level).expected && !levelCell(row, level).programs,
                      }"
                      :title="PROGRAM_LEVEL_LABELS[level]"
                    >
                      {{ PROGRAM_LEVEL_SHORT_LABELS[level] }} {{ levelCell(row, level).programs }}
                    </span>
                  </template>
                </div>
              </td>
              <td
                class="gks-table__num gks-tnum gks-progress__frac"
                :class="`gks-progress__frac--${checkTone(row.checks.faculties)}`"
                data-label="Танхим"
                :title="`${row.faculties} танхим; бакалаврын ${row.bachelorPrograms} ангийн ${row.bachelorWithFaculty} нь танхимтай`"
              >
                {{ row.bachelorPrograms ? `${row.bachelorWithFaculty}/${row.bachelorPrograms}` : '—' }}
              </td>
              <td
                class="gks-table__num gks-tnum gks-progress__frac"
                :class="`gks-progress__frac--${checkTone(row.checks.tuition)}`"
                data-label="Төлбөр"
              >
                {{ row.programs ? `${row.programsWithTuition}/${row.programs}` : '—' }}
              </td>
              <td
                class="gks-table__num gks-tnum gks-progress__frac"
                :class="`gks-progress__frac--${checkTone(row.checks.scholarship)}`"
                data-label="Тэтгэлэг"
              >
                {{ row.degreePrograms ? `${row.programsWithScholarship}/${row.degreePrograms}` : '—' }}
              </td>
              <td class="gks-table__num gks-tnum" data-label="Хянасан">
                <span v-if="row.programs || row.upcomingIntakes">
                  {{ row.programsVerified + row.upcomingIntakesVerified }}/{{ row.programs + row.upcomingIntakes }}
                </span>
                <span v-else class="gks-muted">—</span>
              </td>
              <td data-label="Сүүлд засварласан">
                <template v-if="row.lastActivityAt">
                  <span class="gks-tnum">{{ formatRelativeMn(row.lastActivityAt) }}</span>
                  <small class="gks-cell-sub">{{ row.lastActivityBy ?? 'импорт / бүртгэлгүй' }}</small>
                </template>
                <span v-else class="gks-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="gks-progress__foot gks-tnum">
        Тооцоолсон: {{ formatDateTime(data.generatedAt) }}. "Ирэх элсэлт" — цуцлагдаагүй, манай дотоод
        эцсийн хугацаа нь өнгөрөөгүй элсэлт. Танхимыг зөвхөн бакалаврын ангиас, тэтгэлгийг хэлний
        бэлтгэлээс бусад ангиас шаардана.
      </p>
    </template>
  </div>
</template>

<style scoped>
.gks-progress__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: var(--sp-4); }
.gks-progress__foot { margin-top: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-progress__levels small { margin-left: 4px; font-size: var(--fs-micro); }
.gks-progress__strong { font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-progress__ident { display: flex; align-items: center; gap: var(--sp-3); }
.gks-progress__logo { width: 28px; height: 28px; flex: 0 0 auto; object-fit: contain; border-radius: var(--radius-1); background: var(--n-000); }
.gks-progress__logo--empty { display: inline-flex; align-items: center; justify-content: center; color: var(--text-subtle); background: var(--surface-sunken); }

.gks-progress__meter {
  width: 96px;
  height: 6px;
  margin-bottom: 4px;
  border-radius: var(--radius-pill);
  background: var(--line-hairline);
  overflow: hidden;
}
.gks-progress__fill { display: block; height: 100%; background: var(--warning-fg); }
.gks-progress__fill--DONE { background: var(--success-fg); }
.gks-progress__pct { margin-right: var(--sp-2); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }

.gks-progress__levels-cell { display: flex; flex-wrap: wrap; gap: 4px; }
.gks-progress__chip {
  padding: 1px 6px;
  border: 1px solid var(--line-hairline);
  border-radius: var(--radius-pill);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
  white-space: nowrap;
}
.gks-progress__chip--ok { border-color: var(--success-line); background: var(--success-bg); color: var(--success-fg); }
.gks-progress__chip--none { border-color: var(--danger-line); background: var(--danger-bg); color: var(--danger-fg); }

.gks-progress__frac--ok { color: var(--success-fg); }
.gks-progress__frac--part { color: var(--warning-fg); }
.gks-progress__frac--none { color: var(--danger-fg); }

.gks-progress__recent { margin-top: var(--sp-4); font-size: var(--fs-body-sm); }
.gks-progress__recent summary { cursor: pointer; color: var(--brand-700); font-weight: var(--fw-medium); }
.gks-progress__recent ul { margin: var(--sp-3) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-progress__recent li { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; }
</style>
