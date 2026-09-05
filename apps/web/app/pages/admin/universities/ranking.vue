<script setup lang="ts">
import type {
  GksRankingConfig,
  GksRankingPreview,
  GksRankingRecomputeSummary,
  GksScoreParts,
} from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * GKS ranking configuration (1A-29 … 1A-31).
 *
 * The catalogue and every search result are ordered by `gksRank`, so this
 * screen decides what all visitors see first. Weights are relative — the score
 * normalises by their total — which is why the form shows each one's share as a
 * percentage next to the raw number.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const api = useApi();

/**
 * The five components, in the order the score reads them: `key` is the weight
 * on the config, `part` the matching field of a school's score breakdown.
 */
const COMPONENTS: { key: keyof Weights; part: keyof GksScoreParts; label: string; hint: string }[] = [
  {
    key: 'weightBaseRank',
    part: 'base',
    label: 'Үндсэн рэйтинг (THE)',
    hint: 'Times Higher Education-ий Солонгосын эрэмбэ. Гадны бие даасан үнэлгээ.',
  },
  {
    key: 'weightPartnership',
    part: 'partnership',
    label: 'Агентын гэрээ',
    hint: 'Гэрээтэй > яриа хэлцэлтэй > гэрээгүй. Манай бизнест ямар ач холбогдолтой вэ.',
  },
  {
    key: 'weightFit',
    part: 'fit',
    label: 'Монголд тохирох байдал',
    hint: 'GKS-д хамрагдах эсэх, хэлний бэлтгэл, Монголоос шууд элсүүлдэг эсэх, монгол оюутны тоо.',
  },
  {
    key: 'weightDemand',
    part: 'demand',
    label: 'Эрэлт ба амжилт',
    hint: 'Хэрэглэгчид хэдэн удаа хадгалсан, хэдэн хэрэг явсан, мэдүүлгийн зөвшөөрөгдөх хувь.',
  },
  {
    key: 'weightPractical',
    part: 'practical',
    label: 'Практик хүчин зүйл',
    hint: 'Сургалтын төлбөр, амьжиргааны зардал, Сөүлээс алслалт, мэдээллийн бүрэн байдал.',
  },
];

type Weights = Pick<
  GksRankingConfig,
  | 'weightBaseRank'
  | 'weightPartnership'
  | 'weightFit'
  | 'weightDemand'
  | 'weightPractical'
  | 'unrankedBaseScore'
>;

/** Held as strings so a half-typed box does not momentarily read as 0. */
const form = reactive<Record<keyof Weights, string>>({
  weightBaseRank: '',
  weightPartnership: '',
  weightFit: '',
  weightDemand: '',
  weightPractical: '',
  unrankedBaseScore: '',
});

const config = ref<GksRankingConfig | null>(null);
const preview = ref<GksRankingPreview | null>(null);
const pending = ref(true);
const busy = ref<'save' | 'preview' | 'recompute' | null>(null);
const errorMsg = ref<string | null>(null);
const okMsg = ref<string | null>(null);

function fill(from: GksRankingConfig) {
  config.value = from;
  for (const key of Object.keys(form) as (keyof Weights)[]) form[key] = String(from[key]);
}

const numeric = computed<Weights>(() => ({
  weightBaseRank: Number(form.weightBaseRank) || 0,
  weightPartnership: Number(form.weightPartnership) || 0,
  weightFit: Number(form.weightFit) || 0,
  weightDemand: Number(form.weightDemand) || 0,
  weightPractical: Number(form.weightPractical) || 0,
  unrankedBaseScore: Number(form.unrankedBaseScore) || 0,
}));

const weightTotal = computed(() =>
  COMPONENTS.reduce((sum, component) => sum + Math.max(0, numeric.value[component.key]), 0),
);

/** What each weight is actually worth once normalised — the number that matters. */
function share(key: keyof Weights): string {
  if (weightTotal.value <= 0) return '—';
  return `${Math.round((Math.max(0, numeric.value[key]) / weightTotal.value) * 100)}%`;
}

const dirty = computed(() => {
  if (!config.value) return false;
  return (Object.keys(form) as (keyof Weights)[]).some(
    (key) => Number(form[key]) !== config.value![key],
  );
});

async function load() {
  pending.value = true;
  try {
    fill(await api.get<GksRankingConfig>('/admin/universities/ranking/config'));
    await runPreview();
  } catch {
    errorMsg.value = 'Тохиргоог ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function runPreview() {
  busy.value = 'preview';
  errorMsg.value = null;
  try {
    preview.value = await api.get<GksRankingPreview>('/admin/universities/ranking/preview', {
      query: { ...numeric.value, limit: 25 },
    });
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Урьдчилсан тооцоо амжилтгүй';
  } finally {
    busy.value = null;
  }
}

async function save() {
  busy.value = 'save';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    fill(await api.patch<GksRankingConfig>('/admin/universities/ranking/config', numeric.value));
    okMsg.value = 'Хадгаллаа — бүх сургуулийн эрэмбэ дахин тооцоологдлоо.';
    await runPreview();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Хадгалж чадсангүй';
  } finally {
    busy.value = null;
  }
}

async function recompute() {
  busy.value = 'recompute';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    const summary = await api.post<GksRankingRecomputeSummary>(
      '/admin/universities/ranking/recompute',
    );
    okMsg.value = `${summary.scored} сургуулийг дахин эрэмблэлээ (${summary.durationMs} мс).`;
    await runPreview();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Тооцоолж чадсангүй';
  } finally {
    busy.value = null;
  }
}

function reset() {
  if (config.value) fill(config.value);
}

/** One bar per component, in the same order as the weight form above. */
function partRows(parts: GksScoreParts) {
  return COMPONENTS.map((component) => ({
    label: component.label,
    value: parts[component.part],
  }));
}

const expanded = ref<number | null>(null);

useHead({ title: 'GKS эрэмбэ · CRM' });
</script>

<template>
  <div class="gks-rank">
    <header class="gks-rank__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-rank__title">GKS эрэмбэ</h1>
        <p class="gks-rank__hint">
          Нийтийн каталог, хайлтын үр дүн бүр энэ эрэмбээр харагдана. Жин нь харьцангуй —
          нийлбэр нь 100 байх шаардлагагүй, доорх хувь нь бодит жинг харуулна.
        </p>
      </div>
      <NuxtLink to="/admin/universities" class="gks-rank__back">
        <DsIcon name="arrow-left" :size="16" /> Сургуулийн жагсаалт
      </NuxtLink>
    </header>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>
    <DsCard v-if="okMsg"><p class="gks-rank__ok">{{ okMsg }}</p></DsCard>

    <div v-if="pending" class="gks-rank__skeleton">
      <div v-for="n in 4" :key="n" class="gks-rank__skeleton-row" />
    </div>

    <template v-else>
      <DsCard title="Жин">
        <div class="gks-rank__weights">
          <div v-for="component in COMPONENTS" :key="component.key" class="gks-rank__weight">
            <DsInput
              v-model="form[component.key]"
              :label="component.label"
              type="number"
              min="0"
              max="100"
              step="1"
              :hint="component.hint"
            />
            <span class="gks-rank__share gks-tnum">{{ share(component.key) }}</span>
          </div>
        </div>

        <div class="gks-rank__floor">
          <DsInput
            v-model="form.unrankedBaseScore"
            label="Рэйтингд ороогүй сургуулийн суурь оноо"
            type="number"
            min="0"
            max="100"
            step="1"
            hint="THE-д ороогүй 94 сургууль үндсэн рэйтингийн хэсэгт энэ оноог авна. Саармаг утга — тэг биш."
          />
        </div>

        <div class="gks-rank__actions">
          <DsButton :loading="busy === 'save'" :disabled="!dirty" variant="accent" @click="save">
            Хадгалах, дахин эрэмбэлэх
          </DsButton>
          <DsButton :loading="busy === 'preview'" variant="secondary" icon-left="eye" @click="runPreview">
            Урьдчилан харах
          </DsButton>
          <DsButton v-if="dirty" variant="ghost" @click="reset">Буцаах</DsButton>
          <span class="gks-rank__spacer" />
          <DsButton :loading="busy === 'recompute'" variant="secondary" icon-left="refresh-cw" @click="recompute">
            Одоо дахин тооцоолох
          </DsButton>
        </div>
        <p class="gks-rank__note">
          Эрэмбэ шөнө бүр, мөн каталогийн засвар бүрийн дараа автоматаар шинэчлэгддэг.
          Дээрх товч нь зөвхөн хүлээхгүйгээр яг одоо ажиллуулна.
        </p>
      </DsCard>

      <DsCard v-if="preview" :title="`Эхний ${preview.rows.length} сургууль`">
        <p class="gks-rank__note">
          {{ dirty ? 'Хадгалаагүй жингээр тооцоолсон урьдчилсан жагсаалт.' : 'Одоогийн жингээр.' }}
          Нийт {{ preview.total }} сургууль эрэмбэлэгдсэн. Мөр дээр дарж задаргааг харна уу.
        </p>
        <div class="gks-rank__table-wrap">
          <table class="gks-table">
            <thead>
              <tr>
                <th class="gks-table__num">#</th>
                <th>Сургууль</th>
                <th class="gks-table__num">Оноо</th>
                <th class="gks-table__num">Засвар</th>
                <th class="gks-table__num">THE</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in preview.rows" :key="`${row.rank}-${row.nameMn}`">
                <tr
                  class="gks-rank__row"
                  @click="expanded = expanded === row.rank ? null : row.rank"
                >
                  <td class="gks-tnum gks-table__num">{{ row.rank }}</td>
                  <td>{{ row.nameMn }}</td>
                  <td class="gks-tnum gks-table__num">{{ row.score.toFixed(2) }}</td>
                  <td class="gks-tnum gks-table__num">
                    <span v-if="row.boost">{{ row.boost > 0 ? '+' : '' }}{{ row.boost }}</span>
                    <span v-else class="gks-rank__muted">—</span>
                  </td>
                  <td class="gks-tnum gks-table__num">
                    <span v-if="row.theKoreaRank">#{{ row.theKoreaRank }}</span>
                    <span v-else class="gks-rank__muted">—</span>
                  </td>
                </tr>
                <tr v-if="expanded === row.rank" class="gks-rank__detail">
                  <td colspan="5">
                    <ul class="gks-rank__parts">
                      <li v-for="part in partRows(row.parts)" :key="part.label">
                        <span class="gks-rank__part-label">{{ part.label }}</span>
                        <span class="gks-rank__bar" aria-hidden="true">
                          <span class="gks-rank__bar-fill" :style="{ width: `${part.value}%` }" />
                        </span>
                        <span class="gks-tnum gks-rank__part-value">{{ part.value.toFixed(0) }}</span>
                      </li>
                    </ul>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-rank { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-rank__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-5); }
.gks-rank__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-rank__hint { max-width: 62ch; margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-rank__back { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--fs-body-sm); text-decoration: none; }
.gks-rank__back:hover { color: var(--text-strong); }
.gks-rank__ok { color: var(--text-strong); }

.gks-rank__weights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4) var(--sp-5); }
.gks-rank__weight { display: flex; align-items: flex-start; gap: var(--sp-3); }
.gks-rank__weight :deep(.gks-field) { flex: 1; }
.gks-rank__share {
  flex: none;
  min-width: 3.5ch;
  padding-top: 26px;
  text-align: right;
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.gks-rank__floor { margin-top: var(--sp-5); max-width: 48ch; }

.gks-rank__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-top: var(--sp-5); }
.gks-rank__spacer { flex: 1; }
.gks-rank__note { margin-top: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); }

.gks-rank__table-wrap { margin-top: var(--sp-4); overflow-x: auto; }
.gks-rank__row { cursor: pointer; }
.gks-rank__row:hover { background: var(--surface-sunken); }
.gks-rank__muted { color: var(--text-subtle); }
.gks-rank__detail > td { background: var(--surface-sunken); }
.gks-rank__parts { display: grid; gap: var(--sp-2); padding: var(--sp-3) 0; }
.gks-rank__parts li { display: grid; grid-template-columns: 22ch 1fr 4ch; align-items: center; gap: var(--sp-3); }
.gks-rank__part-label { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-rank__part-value { font-size: var(--fs-caption); font-weight: var(--fw-semibold); text-align: right; }
.gks-rank__bar { display: block; height: 6px; background: var(--surface-card); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-pill); overflow: hidden; }
.gks-rank__bar-fill { display: block; height: 100%; background: var(--text-strong); }

.gks-rank__skeleton { display: grid; gap: var(--sp-3); }
.gks-rank__skeleton-row { height: 64px; background: var(--surface-sunken); border-radius: var(--radius-1); }

@media (max-width: 900px) {
  .gks-rank__weights { grid-template-columns: 1fr; }
  .gks-rank__head { flex-direction: column; }
}
</style>
