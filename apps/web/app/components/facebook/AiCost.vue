<script setup lang="ts">
import type { FacebookAiCostReport, FacebookAiCostUsage, FacebookReportPreset } from '@gks/shared';

/**
 * What the assistant's Messenger answers cost (2F-11) — its own section under
 * the Page report, on its own request: the report above counts people, this
 * counts tokens and dollars, and a slow or failed cost query must not hold the
 * people figures back.
 *
 * Follows the report's period. `stamp` is the report's `generatedAt`, so the
 * «Шинэчлэх» button above refreshes this too.
 */
const props = defineProps<{
  preset: FacebookReportPreset;
  from: string;
  to: string;
  previousLabel: string;
  stamp?: string;
}>();

const api = useApi();

const cost = ref<FacebookAiCostReport | null>(null);
const pending = ref(true);
const error = ref<string | null>(null);
let requestId = 0;

async function load(): Promise<void> {
  if (props.preset === 'custom' && (!props.from || !props.to)) return;
  const id = ++requestId;
  pending.value = true;
  error.value = null;
  try {
    const result = await api.get<FacebookAiCostReport>(
      `/admin/facebook/report/ai-cost?${facebookReportQuery(props.preset, props.from, props.to)}`,
    );
    if (id === requestId) cost.value = result;
  } catch (e) {
    if (id === requestId) error.value = apiErrorMessage(e, 'AI-ийн зардлыг ачаалж чадсангүй');
  } finally {
    if (id === requestId) pending.value = false;
  }
}

watch(() => [props.preset, props.from, props.to, props.stamp], () => void load());
onMounted(load);

const multiDay = computed(() => (cost.value?.days.length ?? 0) > 1);
const activeDays = computed(() => [...(cost.value?.days ?? [])].filter((day) => day.answers > 0).reverse());

const costMetric = computed(() => ({
  value: cost.value?.totals.costUsd ?? 0,
  previous: cost.value?.previous.costUsd ?? 0,
  changePercent: cost.value?.costChangePercent ?? null,
}));
const answersMetric = computed(() => {
  const value = cost.value?.totals.answers ?? 0;
  const previous = cost.value?.previous.answers ?? 0;
  return { value, previous, changePercent: previous ? Math.round(((value - previous) / previous) * 1000) / 10 : null };
});

/** Cache share of one row; old answers recorded none, so a row with no cache figure says nothing. */
function cacheShare(row: FacebookAiCostUsage): string {
  return row.promptTokens && row.cachedPromptTokens ? `${Math.round((row.cachedPromptTokens / row.promptTokens) * 100)}%` : '—';
}
</script>

<template>
  <section class="gks-fbai" aria-labelledby="gks-fbai-title">
    <header class="gks-fbai__head">
      <h2 id="gks-fbai-title" class="gks-fbai__title">AI-ийн зардал</h2>
      <p class="gks-fbai__lead">
        Facebook дээрх AI хариултын token ба зардал (USD) — дээрх үзүүлэлтүүдээс тусдаа тооцоо.
      </p>
    </header>

    <p v-if="error" class="gks-fbai__error">{{ error }}</p>
    <p v-else-if="!cost" class="gks-fbai__muted">{{ pending ? 'Ачаалж байна…' : '' }}</p>

    <template v-else>
      <DsCard title="Зардал" :eyebrow="cost.period.labelMn">
        <div class="gks-stats">
          <ReportsMetricTile label="Нийт зардал" :metric="costMetric" :format="formatUsd" :higher-is-better="false" />
          <ReportsMetricTile label="AI хариулт" :metric="answersMetric" />
          <div class="gks-stat">
            <span class="gks-stat__label">Нэг хариултын зардал</span>
            <span class="gks-stat__value gks-tnum">{{ formatUsd(cost.costPerAnswerUsd) }}</span>
            <span class="gks-stat__foot">Нийт зардал ÷ AI хариулт</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">AI авсан нэг контактын зардал</span>
            <span class="gks-stat__value gks-tnum">{{ formatUsd(cost.costPerAiLeadUsd) }}</span>
            <span class="gks-stat__foot">AI {{ cost.aiLeads }} контакт авсан</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Cache-ээс авсан оролт</span>
            <span class="gks-stat__value gks-tnum">{{ formatRate(cost.cachedSharePercent) }}</span>
            <span class="gks-stat__foot">Өндөр байх тусам хямд (10 дахин хямд үнэтэй)</span>
          </div>
        </div>

        <div class="gks-fbai__tokens">
          <span>Оролт <b class="gks-tnum">{{ formatTokens(cost.totals.promptTokens) }}</b></span>
          <span>үүнээс cache <b class="gks-tnum">{{ formatTokens(cost.totals.cachedPromptTokens) }}</b></span>
          <span>Гаралт <b class="gks-tnum">{{ formatTokens(cost.totals.completionTokens) }}</b></span>
          <span>Харьцуулалт: {{ previousLabel }}</span>
        </div>

        <p v-if="cost.totals.estimatedAnswers > 0" class="gks-fbai__warn">
          <strong class="gks-tnum">{{ cost.totals.estimatedAnswers }}</strong> хариулт зардлаа хадгалж эхлэхээс өмнөх тул
          cache-ийн хөнгөлөлтгүй жагсаалтын үнээр тооцсон — бодит нэхэмжлэлээс өндөр (10-р сарын 8–10-нд ~1.8×) гарна.
        </p>
      </DsCard>

      <div class="gks-reports__pair">
        <DsCard v-if="multiDay" title="Өдрөөр" eyebrow="AI хариулт ба зардал">
          <p v-if="!activeDays.length" class="gks-fbai__muted">Энэ хугацаанд AI хариулаагүй.</p>
          <div v-else class="gks-fbai__table-wrap">
            <table class="gks-fbai__table">
              <thead>
                <tr>
                  <th>Өдөр</th>
                  <th>Хариулт</th>
                  <th>Оролт</th>
                  <th>Cache</th>
                  <th>Гаралт</th>
                  <th>Зардал</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in activeDays" :key="day.day">
                  <td>{{ formatReportDay(day.day) }}</td>
                  <td class="gks-tnum">{{ day.answers }}</td>
                  <td class="gks-tnum">{{ formatTokens(day.promptTokens) }}</td>
                  <td class="gks-tnum">{{ cacheShare(day) }}</td>
                  <td class="gks-tnum">{{ formatTokens(day.completionTokens) }}</td>
                  <td class="gks-tnum gks-fbai__strong">{{ formatUsd(day.costUsd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DsCard>

        <DsCard title="Моделиор" eyebrow="Аль модель хариулсан">
          <p v-if="!cost.models.length" class="gks-fbai__muted">Энэ хугацаанд AI хариулаагүй.</p>
          <div v-else class="gks-fbai__table-wrap">
            <table class="gks-fbai__table">
              <thead>
                <tr>
                  <th>Модель</th>
                  <th>Хариулт</th>
                  <th>Cache</th>
                  <th>Нэг хариулт</th>
                  <th>Зардал</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in cost.models" :key="row.model">
                  <td>{{ aiModelLabel(row.model) }}</td>
                  <td class="gks-tnum">{{ row.answers }}</td>
                  <td class="gks-tnum">{{ cacheShare(row) }}</td>
                  <td class="gks-tnum">{{ formatUsd(row.answers ? row.costUsd / row.answers : null) }}</td>
                  <td class="gks-tnum gks-fbai__strong">{{ formatUsd(row.costUsd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DsCard>
      </div>

      <p class="gks-reports__note">
        Зардал нь API-ийн жагсаалтын үнээр (USD): Gemini 3.1 Flash-Lite — 1 сая оролт $0.25, cache-ээс $0.025, гаралт $1.50;
        DeepSeek — оргил цагийн үнээр (бусад цагт хагас). Сэтгэгдэлд private reply-аар өгсөн хариу ч орно. Эцсийн дүн нь AI Studio болон
        DeepSeek-ийн нэхэмжлэл.
      </p>
    </template>
  </section>
</template>

<style scoped>
.gks-fbai { display: flex; flex-direction: column; gap: var(--sp-4); padding-top: var(--sp-5); border-top: var(--border-hair) solid var(--line-soft); }
.gks-fbai__head { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-fbai__title { margin: 0; font-size: var(--fs-h3); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-fbai__lead { margin: 0; font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-fbai__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-fbai__muted { color: var(--text-subtle); font-size: var(--fs-body-sm); }

.gks-fbai__tokens {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2) var(--sp-4);
  margin-top: var(--sp-3);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-fbai__tokens b { color: var(--text-strong); }
.gks-fbai__warn {
  margin: var(--sp-3) 0 0;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: var(--fs-micro);
}

.gks-fbai__table-wrap { max-height: 320px; overflow: auto; }
.gks-fbai__table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-fbai__table th {
  position: sticky;
  top: 0;
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-card);
  border-bottom: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
  text-align: right;
  white-space: nowrap;
}
.gks-fbai__table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); text-align: right; color: var(--text-strong); white-space: nowrap; }
.gks-fbai__table th:first-child, .gks-fbai__table td:first-child { text-align: left; }
.gks-fbai__strong { font-weight: var(--fw-semibold); }
</style>
