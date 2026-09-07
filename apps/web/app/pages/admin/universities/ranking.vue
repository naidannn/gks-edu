<script setup lang="ts">
import type {
  GksManualRanking,
  GksManualRankingRow,
  GksRankingConfig,
  GksRankingMode,
  GksRankingPreview,
  GksRankingRecomputeSummary,
  GksScoreParts,
} from '@gks/shared';

/**
 * GKS ranking configuration (1A-29 … 1A-31, 1A-35).
 *
 * The catalogue and every search result are ordered by `gksRank`, so this
 * screen decides what all visitors see first. It offers two ways to decide it:
 *
 *  - **Автомат** — the weighted formula. Weights are relative (the score
 *    normalises by their total), which is why each one's real share is shown as
 *    a percentage next to the raw number.
 *  - **Гар** — the office puts the schools in order itself, by dragging or by
 *    typing a position. The formula still scores every school, and still places
 *    the ones nobody has numbered — below the ones somebody has.
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

const MODES: { value: GksRankingMode; label: string; description: string }[] = [
  {
    value: 'MANUAL',
    label: 'Гар эрэмбэ — дарааллыг би тогтооно',
    description: 'Доорх жагсаалтыг чирж эсвэл байрны дугаар шивж эрэмбэлнэ. Дугааргүй үлдсэн сургуулийг систем доор нь байрлуулна.',
  },
  {
    value: 'AUTO',
    label: 'Автомат — томьёо тогтооно',
    description: 'Таван бүрэлдэхүүнийг жингээр холиод эрэмбэлнэ. Гар дугаар хадгалагдана, гэхдээ ажиллахгүй.',
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
const mode = ref<GksRankingMode>('AUTO');
const pending = ref(true);
const busy = ref<'save' | 'preview' | 'recompute' | 'mode' | 'order' | 'seed' | 'clear' | null>(null);
const errorMsg = ref<string | null>(null);
const okMsg = ref<string | null>(null);

/* --- Weights ----------------------------------------------------------- */

function fill(from: GksRankingConfig) {
  config.value = from;
  mode.value = from.mode;
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

/* --- Hand-ordering (1A-35) ---------------------------------------------- */

const rows = ref<GksManualRankingRow[]>([]);
/** The order as the server last confirmed it — the thing "хадгалаагүй" compares against. */
const savedOrder = ref<string[]>([]);
const search = ref('');
const dragFrom = ref<number | null>(null);

const filtering = computed(() => search.value.trim().length > 0);

const visibleRows = computed(() => {
  const query = search.value.trim().toLowerCase();
  const numbered = rows.value.map((row, index) => ({ row, index }));
  if (!query) return numbered;
  return numbered.filter(({ row }) =>
    [row.nameMn, row.nameEn, row.cityMn, row.slug].some((field) =>
      field?.toLowerCase().includes(query),
    ),
  );
});

const orderDirty = computed(
  () =>
    rows.value.length === savedOrder.value.length
    && rows.value.some((row, index) => row.id !== savedOrder.value[index]),
);

function applyList(list: GksManualRanking) {
  rows.value = list.rows;
  savedOrder.value = list.rows.map((row) => row.id);
  mode.value = list.mode;
  if (config.value) config.value = { ...config.value, mode: list.mode };
}

/** Lifts one school out of the list and drops it back at another index. */
function moveRow(from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= rows.value.length) return;
  const next = [...rows.value];
  const [moved] = next.splice(from, 1);
  if (!moved) return;
  next.splice(Math.min(to, next.length), 0, moved);
  rows.value = next;
}

/** The "байр" box: a typed position, clamped to the list. */
function moveTo(index: number, value: string) {
  const position = Number(value);
  if (!Number.isFinite(position)) return;
  moveRow(index, Math.min(Math.max(Math.round(position), 1), rows.value.length) - 1);
}

function onDrop(to: number) {
  if (dragFrom.value !== null) moveRow(dragFrom.value, to);
  dragFrom.value = null;
}

async function loadList() {
  applyList(await api.get<GksManualRanking>('/admin/universities/ranking/manual'));
}

async function saveOrder() {
  busy.value = 'order';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    applyList(
      await api.put<GksManualRanking>('/admin/universities/ranking/manual', {
        order: rows.value.map((row) => row.id),
      }),
    );
    okMsg.value = 'Эрэмбийг хадгаллаа — каталог энэ дарааллаар харагдана.';
    await runPreview();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Эрэмбийг хадгалж чадсангүй');
  } finally {
    busy.value = null;
  }
}

async function seedOrder() {
  busy.value = 'seed';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    applyList(await api.post<GksManualRanking>('/admin/universities/ranking/manual/seed'));
    okMsg.value = 'Одоогийн эрэмбээр 1-ээс эхлэн дугаарлалаа.';
    await runPreview();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Дугаарлаж чадсангүй');
  } finally {
    busy.value = null;
  }
}

async function clearOrder() {
  busy.value = 'clear';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    applyList(await api.delete<GksManualRanking>('/admin/universities/ranking/manual'));
    okMsg.value = 'Гар эрэмбийг цэвэрлэж, автомат горимд шилжлээ.';
    await runPreview();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Цэвэрлэж чадсангүй');
  } finally {
    busy.value = null;
  }
}

async function changeMode(next: GksRankingMode) {
  if (next === config.value?.mode) return;
  busy.value = 'mode';
  errorMsg.value = null;
  okMsg.value = null;
  try {
    fill(await api.patch<GksRankingConfig>('/admin/universities/ranking/config', { mode: next }));
    okMsg.value = next === 'MANUAL'
      ? 'Гар горимд шилжлээ — каталог доорх дарааллаар харагдана.'
      : 'Автомат горимд шилжлээ — томьёо эрэмбийг тогтооно.';
    await Promise.all([loadList(), runPreview()]);
  } catch (err) {
    mode.value = config.value?.mode ?? 'AUTO';
    errorMsg.value = apiErrorMessage(err, 'Горимыг солиж чадсангүй');
  } finally {
    busy.value = null;
  }
}

/* --- Loading and the preview ------------------------------------------- */

async function load() {
  pending.value = true;
  try {
    fill(await api.get<GksRankingConfig>('/admin/universities/ranking/config'));
    await Promise.all([loadList(), runPreview()]);
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
    errorMsg.value = apiErrorMessage(err, 'Урьдчилсан тооцоо амжилтгүй');
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
    await Promise.all([loadList(), runPreview()]);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
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
    await Promise.all([loadList(), runPreview()]);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Тооцоолж чадсангүй');
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
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-page__title">GKS эрэмбэ</h1>
        <p class="gks-page__hint">
          Нийтийн каталог, хайлтын үр дүн бүр энэ эрэмбээр харагдана. Дарааллыг өөрөө
          тогтоох эсвэл томьёонд даалгах хоёр горимтой.
        </p>
      </div>
      <NuxtLink to="/admin/universities" class="gks-page__back">
        <DsIcon name="arrow-left" :size="16" /> Сургуулийн жагсаалт
      </NuxtLink>
    </header>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>
    <DsCard v-if="okMsg"><p class="gks-rank__ok">{{ okMsg }}</p></DsCard>

    <div v-if="pending" class="gks-skeleton">
      <div v-for="n in 4" :key="n" class="gks-skeleton__row" />
    </div>

    <template v-else>
      <DsCard title="Эрэмбийг хэн тогтоох вэ">
        <DsRadio
          name="ranking-mode"
          :options="MODES"
          :model-value="mode"
          @update:model-value="changeMode($event as GksRankingMode)"
        />
      </DsCard>

      <DsCard :title="`Гар эрэмбэ · ${rows.length} сургууль`">
        <p class="gks-rank__note">
          <template v-if="mode === 'MANUAL'">
            Каталог яг энэ дарааллаар харагдана. Мөрийг чирж, эсвэл байрны дугаарыг шивж
            зөөнө. Дараа нь <strong>Эрэмбэ хадгалах</strong> дарна.
          </template>
          <template v-else>
            Одоо автомат горимд байна — доорх дараалал зөвхөн одоогийн байдлыг харуулж байна.
            Хадгалбал гар горимд шилжинэ.
          </template>
        </p>

        <div class="gks-rank__toolbar">
          <DsInput
            v-model="search"
            placeholder="Сургууль хайх…"
            icon-left="search"
            class="gks-rank__search"
          />
          <DsButton
            :loading="busy === 'order'"
            :disabled="!orderDirty"
            variant="accent"
            icon-left="save"
            @click="saveOrder"
          >
            Эрэмбэ хадгалах
          </DsButton>
          <DsButton v-if="orderDirty" variant="ghost" @click="loadList">Буцаах</DsButton>
          <span class="gks-form-actions__spacer" />
          <DsButton
            :loading="busy === 'seed'"
            variant="secondary"
            icon-left="list-ordered"
            @click="seedOrder"
          >
            Одоогийн эрэмбээр дугаарлах
          </DsButton>
          <DsButton
            :loading="busy === 'clear'"
            variant="ghost"
            icon-left="eraser"
            @click="clearOrder"
          >
            Гар эрэмбийг цэвэрлэх
          </DsButton>
        </div>

        <p v-if="orderDirty" class="gks-rank__warn">
          Хадгалаагүй өөрчлөлт байна.
        </p>
        <p v-if="filtering" class="gks-rank__note">
          Хайлт идэвхтэй үед чирэх боломжгүй — байрны дугаарыг шивж зөөнө үү.
        </p>

        <ul class="gks-order">
          <li
            v-for="{ row, index } in visibleRows"
            :key="row.id"
            class="gks-order__row"
            :class="{ 'gks-order__row--dragging': dragFrom === index }"
            :draggable="!filtering"
            @dragstart="dragFrom = index"
            @dragover.prevent
            @drop.prevent="onDrop(index)"
            @dragend="dragFrom = null"
          >
            <DsIcon
              v-if="!filtering"
              name="grip-vertical"
              :size="16"
              class="gks-order__grip"
            />
            <span class="gks-tnum gks-order__pos">{{ index + 1 }}</span>

            <span class="gks-order__name">
              <NuxtLink :to="`/admin/universities/${row.id}`">{{ universityName(row) }}</NuxtLink>
              <span class="gks-order__meta">
                {{ universitySubName(row) ?? row.cityMn }}
                <template v-if="row.theKoreaRank"> · THE #{{ row.theKoreaRank }}</template>
                <template v-if="row.gksScore !== null"> · оноо {{ row.gksScore.toFixed(1) }}</template>
              </span>
            </span>

            <DsBadge v-if="!row.isPublished" tone="neutral">Ноорог</DsBadge>
            <DsBadge v-if="row.agentContractStatus === 'SIGNED'" tone="success">Гэрээтэй</DsBadge>

            <span class="gks-order__actions">
              <input
                class="gks-order__jump gks-tnum"
                type="number"
                min="1"
                :max="rows.length"
                :value="index + 1"
                :aria-label="`${row.nameMn} — байр`"
                @change="moveTo(index, ($event.target as HTMLInputElement).value)"
              >
              <DsIconButton
                icon="chevron-up"
                label="Дээш"
                size="sm"
                :disabled="index === 0"
                @click="moveRow(index, index - 1)"
              />
              <DsIconButton
                icon="chevron-down"
                label="Доош"
                size="sm"
                :disabled="index === rows.length - 1"
                @click="moveRow(index, index + 1)"
              />
            </span>
          </li>
        </ul>
      </DsCard>

      <DsCard title="Жин">
        <p v-if="mode === 'MANUAL'" class="gks-rank__note">
          Гар горимд жин нь зөвхөн <strong>дугаарлаагүй</strong> сургуулиудын дарааллыг
          болон админд харагдах оноог тогтооно.
        </p>
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

        <div class="gks-form-actions">
          <DsButton :loading="busy === 'save'" :disabled="!dirty" variant="accent" @click="save">
            Хадгалах, дахин эрэмбэлэх
          </DsButton>
          <DsButton :loading="busy === 'preview'" variant="secondary" icon-left="eye" @click="runPreview">
            Урьдчилан харах
          </DsButton>
          <DsButton v-if="dirty" variant="ghost" @click="reset">Буцаах</DsButton>
          <span class="gks-form-actions__spacer" />
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
        <div class="gks-table-wrap gks-table-wrap--auto">
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
                  class="gks-row"
                  @click="expanded = expanded === row.rank ? null : row.rank"
                >
                  <td class="gks-tnum gks-table__num">{{ row.rank }}</td>
                  <td>
                    {{ universityName(row) }}
                    <DsBadge v-if="preview.mode === 'MANUAL' && row.manualRank !== null" tone="ink">гар</DsBadge>
                  </td>
                  <td class="gks-tnum gks-table__num">{{ row.score.toFixed(2) }}</td>
                  <td class="gks-tnum gks-table__num">
                    <span v-if="row.boost">{{ row.boost > 0 ? '+' : '' }}{{ row.boost }}</span>
                    <span v-else class="gks-muted">—</span>
                  </td>
                  <td class="gks-tnum gks-table__num">
                    <span v-if="row.theKoreaRank">#{{ row.theKoreaRank }}</span>
                    <span v-else class="gks-muted">—</span>
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
.gks-rank__ok { color: var(--text-strong); }
.gks-rank__weights { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--sp-4) var(--sp-5); }
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
.gks-rank__note { margin-top: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-rank__warn { margin-top: var(--sp-3); color: var(--text-strong); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
.gks-rank__detail > td { background: var(--surface-sunken); }
.gks-rank__parts { display: grid; gap: var(--sp-2); padding: var(--sp-3) 0; }
.gks-rank__parts li { display: grid; grid-template-columns: 22ch 1fr 4ch; align-items: center; gap: var(--sp-3); }
.gks-rank__part-label { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-rank__part-value { font-size: var(--fs-caption); font-weight: var(--fw-semibold); text-align: right; }
.gks-rank__bar { display: block; height: 6px; background: var(--surface-card); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-pill); overflow: hidden; }
.gks-rank__bar-fill { display: block; height: 100%; background: var(--text-strong); }

/* --- The ordering list (1A-35) --- */
.gks-rank__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-3);
  margin-top: var(--sp-4);
}
.gks-rank__search { flex: 1 1 22ch; max-width: 32ch; }

.gks-order {
  margin-top: var(--sp-4);
  max-height: 34rem;
  overflow-y: auto;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-md);
}
.gks-order__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-order__row:last-child { border-bottom: 0; }
.gks-order__row--dragging { opacity: 0.4; }
.gks-order__grip { flex: none; cursor: grab; color: var(--text-subtle); }
.gks-order__pos {
  flex: none;
  min-width: 3.5ch;
  text-align: right;
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
}
.gks-order__name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gks-order__meta { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-order__actions { flex: none; display: flex; align-items: center; gap: var(--sp-2); }
.gks-order__jump {
  width: 6ch;
  padding: var(--sp-1) var(--sp-2);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-sm);
  background: var(--surface-page);
  color: var(--text-strong);
  text-align: right;
}
@media (max-width: 900px) {
.gks-rank__weights { grid-template-columns: 1fr; }
.gks-order__meta { display: none; }
}
</style>
