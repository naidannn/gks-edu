<script setup lang="ts">
import type {
  CatalogueGapState,
  CatalogueIntakeRound,
  CatalogueProgressRow,
  CatalogueProgressSummary,
  ProgramLevel,
} from '@gks/shared';

/**
 * 1A-43 — the intakes tab: which schools have an upcoming round for every
 * level we sell, which were researched and came back empty, and which nobody
 * has looked at yet. A term chip narrows the list to the schools with a round
 * in that intake ("who is in 2027 March").
 */
const props = defineProps<{ rows: CatalogueProgressRow[]; summary: CatalogueProgressSummary }>();

const LEVELS: ProgramLevel[] = ['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'];

const state = ref<CatalogueGapState | ''>('');
const term = ref('');
const q = ref('');
const open = ref(new Set<string>());

const termKey = (round: { year: number; month: number }) => `${round.year}-${round.month}`;

/** The term strip, one line per year. */
const years = computed(() => {
  const byYear = new Map<number, CatalogueProgressSummary['terms']>();
  for (const entry of props.summary.terms) byYear.set(entry.year, [...(byYear.get(entry.year) ?? []), entry]);
  return [...byYear.entries()].map(([year, terms]) => ({ year, terms }));
});

// Rows arrive in the catalogue's order (`gksRank`); filtering keeps it.
const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return props.rows
    .filter((row) => !state.value || row.states.intakes === state.value)
    .filter((row) => !term.value || row.rounds.some((round) => termKey(round) === term.value))
    .filter((row) => !needle || [row.nameEn, row.nameMn, row.nameKo].some((name) => name.toLowerCase().includes(needle)));
});

type LevelView =
  | { kind: 'rounds'; rounds: CatalogueIntakeRound[] }
  | { kind: 'notOffered' | 'missing' | 'none' };

function levelView(row: CatalogueProgressRow, level: ProgramLevel): LevelView {
  const rounds = row.rounds.filter((round) => round.level === level);
  if (rounds.length) return { kind: 'rounds', rounds };
  const cell = row.levels.find((entry) => entry.level === level)!;
  if (cell.notOffered) return { kind: 'notOffered' };
  return { kind: cell.expected ? 'missing' : 'none' };
}

function roundTitle(round: CatalogueIntakeRound): string {
  const deadline = round.internalDeadline ? `манай эцсийн хугацаа ${formatNumericDateUtc(round.internalDeadline)}` : 'огноо ороогүй';
  const source = round.verified ? 'хянасан' : round.aiResearched ? 'AI судалсан' : 'хянаагүй';
  return `${round.year} оны ${round.month}-р сар · ${deadline} · ${source}`;
}

function toggle(id: string) {
  const next = new Set(open.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  open.value = next;
}
</script>

<template>
  <div class="cp-panel">
    <CatalogueProgressGapTiles v-model="state" check="intakes" :counts="summary.states.intakes" :total="rows.length" />

    <DsCard v-if="years.length" title="Элсэлтийн улирлаар">
      <div class="cp-terms">
        <div v-for="group in years" :key="group.year" class="cp-terms__year">
          <span class="cp-terms__label gks-tnum">{{ group.year }} он</span>
          <DsTag
            v-for="entry in group.terms"
            :key="termKey(entry)"
            clickable
            :selected="term === termKey(entry)"
            @click="term = term === termKey(entry) ? '' : termKey(entry)"
          >
            <span class="gks-tnum">{{ entry.month }}-р сар — {{ entry.schools }} сургууль</span>
          </DsTag>
        </div>
      </div>
    </DsCard>

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
            <th v-for="level in LEVELS" :key="level">{{ PROGRAM_LEVEL_LABELS[level] }}</th>
            <th>Судалгаа</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in filtered" :key="row.id">
            <tr>
              <td data-label="Сургууль"><CatalogueProgressSchool :school="row" /></td>
              <td v-for="level in LEVELS" :key="level" :data-label="PROGRAM_LEVEL_LABELS[level]">
                <template v-for="view in [levelView(row, level)]" :key="view.kind">
                  <div v-if="view.kind === 'rounds'" class="cp-rounds">
                    <span
                      v-for="round in view.rounds"
                      :key="termKey(round)"
                      class="cp-round gks-tnum"
                      :class="{ 'cp-round--hit': term === termKey(round), 'cp-round--verified': round.verified }"
                      :title="roundTitle(round)"
                    >
                      {{ round.year }}/{{ round.month }}<DsIcon v-if="round.verified" name="check" :size="12" />
                    </span>
                  </div>
                  <span v-else-if="view.kind === 'missing'" class="cp-missing">Алга</span>
                  <span v-else-if="view.kind === 'notOffered'" class="gks-muted" title="Гадаад оюутан элсүүлдэггүй">Байхгүй</span>
                  <span v-else class="gks-muted">—</span>
                </template>
              </td>
              <td data-label="Судалгаа">
                <template v-if="row.research">
                  <span class="gks-tnum">{{ formatNumericDateUtc(row.research.researchedAt) }}</span>
                  <button
                    v-if="row.research.pending.length"
                    type="button"
                    class="cp-pending-toggle"
                    :aria-expanded="open.has(row.id)"
                    @click="toggle(row.id)"
                  >
                    {{ row.research.pending.length }} олдоогүй
                    <DsIcon :name="open.has(row.id) ? 'chevron-up' : 'chevron-down'" :size="14" />
                  </button>
                </template>
                <span v-else class="cp-missing">Судлаагүй</span>
              </td>
            </tr>
            <tr v-if="row.research && open.has(row.id)" class="cp-detail">
              <td colspan="6">
                <ul>
                  <li v-for="item in row.research.pending" :key="`${item.level}-${item.year}-${item.month}`">
                    <DsBadge tone="neutral">{{ PROGRAM_LEVEL_SHORT_LABELS[item.level] }} {{ item.year }}/{{ item.month }}</DsBadge>
                    <span>
                      {{ item.reason }}
                      <a v-if="item.checkUrl" :href="item.checkUrl" target="_blank" rel="noopener">Шалгах ↗</a>
                    </span>
                  </li>
                </ul>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.cp-panel { display: flex; flex-direction: column; gap: var(--sp-4); }
.cp-terms { display: flex; flex-direction: column; gap: var(--sp-3); }
.cp-terms__year { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.cp-terms__label { min-width: 64px; font-weight: var(--fw-semibold); color: var(--text-strong); }
.cp-toolbar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.cp-toolbar__search { flex: 1 1 260px; max-width: 420px; }

.cp-rounds { display: flex; flex-wrap: wrap; gap: 4px; }
.cp-round {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 8px;
  border: 1px solid var(--success-line);
  border-radius: var(--radius-pill);
  background: var(--success-bg);
  color: var(--success-fg);
  font-size: var(--fs-caption);
  white-space: nowrap;
}
.cp-round--hit { border-color: var(--brand-600); background: var(--brand-600); color: var(--n-000); }
.cp-missing { color: var(--danger-fg); font-weight: var(--fw-semibold); font-size: var(--fs-caption); }

.cp-pending-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: var(--sp-2);
  padding: 0;
  border: 0;
  background: none;
  color: var(--info-fg);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  cursor: pointer;
}
.cp-detail td { background: var(--surface-sunken); }
.cp-detail ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-2); }
.cp-detail li { display: grid; grid-template-columns: 96px 1fr; align-items: baseline; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.cp-detail a { color: var(--brand-700); white-space: nowrap; }
</style>
