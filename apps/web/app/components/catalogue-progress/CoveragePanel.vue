<script setup lang="ts">
import type {
  CatalogueCheck,
  CatalogueGapState,
  CatalogueProgressRow,
  CatalogueProgressSummary,
  ProgramLevel,
} from '@gks/shared';

/**
 * 1A-43 — one tab for programmes, colleges, tuition or scholarship. Each shows
 * only the numbers its own check is about, so "which schools have no tuition
 * entered" is one click on a tile, not a column to scan across a wide table.
 */
type CoverageCheck = Exclude<CatalogueCheck, 'intakes'>;

const props = defineProps<{
  check: CoverageCheck;
  rows: CatalogueProgressRow[];
  summary: CatalogueProgressSummary;
}>();

const LEVELS: ProgramLevel[] = ['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'];
const SEVERITY: CatalogueGapState[] = ['MISSING', 'PARTIAL', 'NO_BASE', 'NOT_FOUND', 'COMPLETE'];

/** What "X of Y" means on each tab; programmes are counted per level instead. */
const FRACTION: Record<Exclude<CoverageCheck, 'programs'>, {
  filled: string;
  gap: string;
  part: (row: CatalogueProgressRow) => number;
  whole: (row: CatalogueProgressRow) => number;
}> = {
  faculties: {
    filled: 'Танхимтай бакалаврын анги',
    gap: 'Танхимгүй',
    part: (row) => row.bachelorWithFaculty,
    whole: (row) => row.bachelorPrograms,
  },
  tuition: {
    filled: 'Төлбөртэй анги',
    gap: 'Төлбөргүй',
    part: (row) => row.programsWithTuition,
    whole: (row) => row.programs,
  },
  scholarship: {
    filled: 'Тэтгэлэгтэй анги (бак/маг/док)',
    gap: 'Тэтгэлэггүй',
    part: (row) => row.programsWithScholarship,
    whole: (row) => row.degreePrograms,
  },
};

const fraction = computed(() => (props.check === 'programs' ? null : FRACTION[props.check]));

const state = ref<CatalogueGapState | ''>('');
const q = ref('');

const share = (row: CatalogueProgressRow) => {
  const f = fraction.value;
  if (!f) return row.checks.programs;
  const whole = f.whole(row);
  return whole ? f.part(row) / whole : 0;
};

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.rows
    .filter((row) => !state.value || row.states[props.check] === state.value)
    .filter((row) => !needle || [row.nameEn, row.nameMn, row.nameKo].some((name) => name.toLowerCase().includes(needle)))
    .sort(
      (a, b) =>
        SEVERITY.indexOf(a.states[props.check]) - SEVERITY.indexOf(b.states[props.check]) ||
        share(a) - share(b) ||
        universityName(a).localeCompare(universityName(b)),
    );
});

function levelCell(row: CatalogueProgressRow, level: ProgramLevel) {
  return row.levels.find((cell) => cell.level === level)!;
}
</script>

<template>
  <div class="cp-panel">
    <CatalogueProgressGapTiles v-model="state" :check="check" :counts="summary.states[check]" :total="rows.length" />

    <div class="cp-toolbar">
      <DsInput v-model="q" type="search" icon-left="search" placeholder="Сургууль хайх…" class="cp-toolbar__search" />
      <span class="gks-result-count gks-tnum">{{ filtered.length }} сургууль</span>
    </div>

    <DsCard v-if="!filtered.length">Энэ ангилалд сургууль алга.</DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr>
            <th>Сургууль</th>
            <template v-if="check === 'programs'">
              <th v-for="level in LEVELS" :key="level" class="gks-table__num">{{ PROGRAM_LEVEL_LABELS[level] }}</th>
              <th class="gks-table__num">Нийт</th>
            </template>
            <template v-else-if="fraction">
              <th>{{ fraction.filled }}</th>
              <th class="gks-table__num">{{ fraction.gap }}</th>
              <th v-if="check === 'faculties'" class="gks-table__num">Танхимын тоо</th>
              <th v-if="check === 'tuition'" class="gks-table__num" title="Өнгөрсөн жилээс өмнөх үнийн хүснэгтээс авсан">Хуучирсан үнэ</th>
            </template>
            <th>Сүүлд засварласан</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id">
            <td data-label="Сургууль"><CatalogueProgressSchool :school="row" /></td>

            <template v-if="check === 'programs'">
              <td
                v-for="level in LEVELS"
                :key="level"
                class="gks-table__num gks-tnum"
                :data-label="PROGRAM_LEVEL_LABELS[level]"
              >
                <span v-if="levelCell(row, level).programs" class="cp-count">{{ levelCell(row, level).programs }}</span>
                <span v-else-if="levelCell(row, level).expected" class="cp-missing">Алга</span>
                <span v-else-if="levelCell(row, level).notOffered" class="gks-muted" title="Гадаад оюутан элсүүлдэггүй">Байхгүй</span>
                <span v-else class="gks-muted">—</span>
              </td>
              <td class="gks-table__num gks-tnum" data-label="Нийт">{{ row.programs || '—' }}</td>
            </template>

            <template v-else-if="fraction">
              <td :data-label="fraction.filled">
                <div v-if="fraction.whole(row)" class="cp-frac">
                  <span class="cp-frac__bar">
                    <span
                      class="cp-frac__fill"
                      :class="`cp-frac__fill--${row.states[check]}`"
                      :style="{ width: `${Math.round(share(row) * 100)}%` }"
                    />
                  </span>
                  <span class="gks-tnum">{{ fraction.part(row) }} / {{ fraction.whole(row) }}</span>
                </div>
                <span v-else class="gks-muted">{{ CATALOGUE_GAP_LABELS[check].NO_BASE }}</span>
              </td>
              <td class="gks-table__num gks-tnum" :data-label="fraction.gap">
                <span v-if="fraction.whole(row) - fraction.part(row)" class="cp-missing">
                  {{ fraction.whole(row) - fraction.part(row) }}
                </span>
                <span v-else class="gks-muted">—</span>
              </td>
              <td v-if="check === 'faculties'" class="gks-table__num gks-tnum" data-label="Танхимын тоо">
                {{ row.faculties || '—' }}
              </td>
              <td v-if="check === 'tuition'" class="gks-table__num gks-tnum" data-label="Хуучирсан үнэ">
                <span v-if="row.programsStaleTuition" class="cp-stale">{{ row.programsStaleTuition }}</span>
                <span v-else class="gks-muted">—</span>
              </td>
            </template>

            <td data-label="Сүүлд засварласан">
              <template v-if="row.lastActivityAt">
                <span class="gks-tnum">{{ formatRelativeMn(row.lastActivityAt) }}</span>
                <small class="gks-cell-sub">{{ row.lastActivityBy ?? 'импорт' }}</small>
              </template>
              <span v-else class="gks-muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cp-panel { display: flex; flex-direction: column; gap: var(--sp-4); }
.cp-toolbar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.cp-toolbar__search { flex: 1 1 260px; max-width: 420px; }

.cp-count { font-weight: var(--fw-semibold); color: var(--success-fg); }
.cp-missing { color: var(--danger-fg); font-weight: var(--fw-semibold); font-size: var(--fs-caption); }
.cp-stale { color: var(--warning-fg); font-weight: var(--fw-semibold); }

.cp-frac { display: flex; align-items: center; gap: var(--sp-3); }
.cp-frac__bar { width: 120px; height: 8px; flex: 0 0 auto; border-radius: var(--radius-pill); background: var(--line-hairline); overflow: hidden; }
.cp-frac__fill { display: block; height: 100%; background: var(--warning-fg); }
.cp-frac__fill--COMPLETE { background: var(--success-fg); }
</style>
