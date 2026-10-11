<script setup lang="ts">
import type { FacebookReport, FacebookReportPreset } from '@gks/shared';

/**
 * The Facebook Page report (2F-10): how many people wrote, how many were new,
 * how many left a name and number, by day — and who answered them.
 *
 * Below it, apart, what the assistant's answers cost (2F-11, `FacebookAiCost`).
 *
 * Opens on «Өнөөдөр», because that is the question the office asks of the
 * Page: "how many wrote today, how many numbers did we get". Every figure is
 * shown beside the same figure one window earlier, as in `/admin/reports`.
 */
const emit = defineEmits<{ openThread: [id: string] }>();

const api = useApi();

const preset = ref<FacebookReportPreset>('today');
const from = ref('');
const to = ref('');
const report = ref<FacebookReport | null>(null);
const pending = ref(true);
const error = ref<string | null>(null);
/** The bar under the pointer, for its tooltip. */
const hovered = ref<{ kind: 'day' | 'hour'; index: number } | null>(null);

/** Out-of-order answers: only the latest request may write the screen. */
let requestId = 0;

async function load(): Promise<void> {
  if (preset.value === 'custom' && (!from.value || !to.value)) return;
  const id = ++requestId;
  hovered.value = null;
  pending.value = true;
  error.value = null;
  try {
    const result = await api.get<FacebookReport>(
      `/admin/facebook/report?${facebookReportQuery(preset.value, from.value, to.value)}`,
    );
    if (id === requestId) report.value = result;
  } catch (e) {
    if (id === requestId) error.value = apiErrorMessage(e, 'Тайланг ачаалж чадсангүй');
  } finally {
    if (id === requestId) pending.value = false;
  }
}

watch([preset, from, to], () => void load());
onMounted(load);

const previousLabel = computed(() => facebookPreviousLabel(report.value?.period.preset ?? preset.value));
const multiDay = computed(() => (report.value?.days.length ?? 0) > 1);
const dayMax = computed(() => barMax(report.value?.days.map((day) => day.people) ?? []));
const hourMax = computed(() => barMax(report.value?.hours ?? []));
const peaks = computed(() => busiestHours(report.value?.hours ?? []));
const replyTotal = computed(() => {
  const totals = report.value?.totals;
  return totals ? totals.aiReplies.value + totals.staffReplies.value : 0;
});
const aiShare = computed(() =>
  replyTotal.value ? Math.round(((report.value?.totals.aiReplies.value ?? 0) / replyTotal.value) * 100) : null,
);

/** Long windows label every n-th day so the axis never collides. */
const dayLabelStep = computed(() => {
  const count = report.value?.days.length ?? 0;
  return count <= 10 ? 1 : count <= 31 ? 5 : 30;
});
</script>

<template>
  <div class="gks-fbr">
    <div class="gks-fbr__bar">
      <DsSelect
        :model-value="preset"
        :options="FACEBOOK_REPORT_PRESET_OPTIONS"
        label="Хугацаа"
        @update:model-value="preset = $event as FacebookReportPreset"
      />
      <template v-if="preset === 'custom'">
        <DsInput v-model="from" type="date" label="Эхлэх" />
        <DsInput v-model="to" type="date" label="Дуусах" />
      </template>
      <p v-if="report" class="gks-fbr__period">
        <strong>{{ report.period.labelMn }}</strong>
        <span>Харьцуулалт: {{ previousLabel }}</span>
      </p>
      <DsButton size="sm" variant="ghost" icon-left="refresh-cw" :loading="pending" @click="load">Шинэчлэх</DsButton>
    </div>

    <div class="gks-fbr__body">
      <p v-if="error" class="gks-fbr__error">{{ error }}</p>
      <p v-else-if="!report" class="gks-fbr__muted">Ачаалж байна…</p>

      <template v-else>
        <DsCard title="Гол үзүүлэлт" :eyebrow="report.period.labelMn">
          <div class="gks-stats">
            <ReportsMetricTile label="Холбогдсон хүн" :metric="report.totals.people" />
            <ReportsMetricTile label="Шинээр бичсэн хүн" :metric="report.totals.newPeople" />
            <ReportsMetricTile label="Авсан контакт (утас)" :metric="report.totals.leads" />
            <ReportsMetricTile label="Ирсэн мессеж" :metric="report.totals.inbound" />
            <ReportsMetricTile label="Сэтгэгдэл" :metric="report.totals.comments" />
          </div>
          <div class="gks-stats gks-fbr__second">
            <div class="gks-stat">
              <span class="gks-stat__label">Контакт авсан хувь</span>
              <span class="gks-stat__value gks-tnum">{{ formatRate(report.leadRate) }}</span>
              <span class="gks-stat__foot">Шинээр бичсэн хүнээс утсаа үлдээсэн</span>
            </div>
            <div class="gks-stat">
              <span class="gks-stat__label">Гэрээ болсон</span>
              <span class="gks-stat__value gks-tnum">{{ report.leadsWon }}</span>
              <span class="gks-stat__foot">Энэ хугацаанд авсан контактаас, одоогийн байдлаар</span>
            </div>
            <div class="gks-stat">
              <span class="gks-stat__label">Анхны хариу (медиан)</span>
              <span class="gks-stat__value gks-tnum">{{ formatReplyMinutes(report.firstReplyMedianMinutes) }}</span>
              <span class="gks-stat__foot">Шинэ хүний эхний мессежээс</span>
            </div>
            <div class="gks-stat" :class="{ 'gks-stat--warn': report.newUnanswered > 0 }">
              <span class="gks-stat__label">Хариу аваагүй шинэ хүн</span>
              <span class="gks-stat__value gks-tnum">{{ report.newUnanswered }}</span>
              <span class="gks-stat__foot">AI ч, ажилтан ч хариулаагүй</span>
            </div>
          </div>
        </DsCard>

        <DsCard v-if="multiDay" title="Өдрөөр" eyebrow="Холбогдсон хүн, өдөр бүр">
          <div class="gks-fbr__chart" role="img" :aria-label="`Өдөр бүр холбогдсон хүний тоо, ${report.period.labelMn}`">
            <div
              v-for="(day, index) in report.days"
              :key="day.day"
              class="gks-fbr__col"
              @mouseenter="hovered = { kind: 'day', index }"
              @mouseleave="hovered = null"
            >
              <div
                v-if="hovered?.kind === 'day' && hovered.index === index"
                class="gks-fbr__tip"
                :class="{ 'gks-fbr__tip--end': index > report.days.length / 2 }"
              >
                <strong>{{ formatReportDay(day.day) }}</strong>
                <span>Холбогдсон: <b class="gks-tnum">{{ day.people }}</b></span>
                <span>Шинэ: <b class="gks-tnum">{{ day.newPeople }}</b></span>
                <span>Контакт: <b class="gks-tnum">{{ day.leads }}</b></span>
                <span>Мессеж: <b class="gks-tnum">{{ day.messages }}</b></span>
              </div>
              <span class="gks-fbr__track">
                <span class="gks-fbr__fill" :style="{ height: barWidth(day.people, dayMax) }" />
              </span>
              <span class="gks-fbr__axis">{{ index % dayLabelStep === 0 ? formatReportDay(day.day).slice(0, 5) : '' }}</span>
            </div>
          </div>

          <div class="gks-fbr__table-wrap">
            <table class="gks-fbr__table">
              <thead>
                <tr>
                  <th>Өдөр</th>
                  <th>Холбогдсон</th>
                  <th>Шинэ</th>
                  <th>Контакт</th>
                  <th>Мессеж</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="day in [...report.days].reverse()" :key="day.day">
                  <td>{{ formatReportDay(day.day) }}</td>
                  <td class="gks-tnum">{{ day.people }}</td>
                  <td class="gks-tnum">{{ day.newPeople }}</td>
                  <td class="gks-tnum" :class="{ 'gks-fbr__strong': day.leads > 0 }">{{ day.leads }}</td>
                  <td class="gks-tnum">{{ day.messages }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DsCard>

        <div class="gks-reports__pair">
          <DsCard title="Хэдэн цагт бичдэг вэ" eyebrow="Ирсэн мессеж, цагаар (Улаанбаатар)">
            <p v-if="!peaks.length" class="gks-fbr__muted">Энэ хугацаанд мессеж ирээгүй.</p>
            <template v-else>
              <div class="gks-fbr__chart gks-fbr__chart--hours" role="img" aria-label="Ирсэн мессеж цагаар">
                <div
                  v-for="(value, hour) in report.hours"
                  :key="hour"
                  class="gks-fbr__col"
                  @mouseenter="hovered = { kind: 'hour', index: hour }"
                  @mouseleave="hovered = null"
                >
                  <div
                    v-if="hovered?.kind === 'hour' && hovered.index === hour"
                    class="gks-fbr__tip"
                    :class="{ 'gks-fbr__tip--end': hour > 12 }"
                  >
                    <strong>{{ String(hour).padStart(2, '0') }}:00–{{ String((hour + 1) % 24).padStart(2, '0') }}:00</strong>
                    <span><b class="gks-tnum">{{ value }}</b> мессеж</span>
                  </div>
                  <span class="gks-fbr__track">
                    <span class="gks-fbr__fill" :style="{ height: barWidth(value, hourMax) }" />
                  </span>
                  <span class="gks-fbr__axis">{{ hour % 3 === 0 ? hour : '' }}</span>
                </div>
              </div>
              <p class="gks-reports__note">
                Хамгийн их:
                <template v-for="(peak, index) in peaks" :key="peak.hour">
                  <strong class="gks-tnum">{{ peak.label }}</strong> ({{ peak.count }}){{ index < peaks.length - 1 ? ', ' : '' }}
                </template>
              </p>
            </template>
          </DsCard>

          <DsCard title="Хаанаас ирсэн бэ" eyebrow="Шинээр бичсэн хүн, эх сурвалжаар">
            <ReportsBarList
              :rows="report.sources.map((row) => ({
                key: row.source,
                label: FACEBOOK_SOURCE_LABELS[row.source],
                value: row.count,
              }))"
              empty-text="Энэ хугацаанд шинэ хүн бичээгүй."
            />
          </DsCard>
        </div>

        <div class="gks-reports__pair">
          <DsCard title="Хэн хариулсан бэ" eyebrow="Хүргэгдсэн хариу">
            <ReportsBarList
              :rows="[
                { key: 'ai', label: 'AI туслах', value: report.totals.aiReplies.value },
                ...report.staff.map((row) => ({
                  key: row.staffId ?? 'page',
                  label: row.name,
                  value: row.replies,
                  note: `${row.replies} хариу · ${row.threads} чат`,
                })),
              ]"
              empty-text="Энэ хугацаанд хариу илгээгдээгүй."
            />
            <p v-if="aiShare !== null" class="gks-reports__note">
              Нийт <strong class="gks-tnum">{{ replyTotal }}</strong> хариуны <strong class="gks-tnum">{{ aiShare }}%</strong>-ийг AI өгсөн.
            </p>
          </DsCard>

          <DsCard title="Авсан контактууд" :eyebrow="`${report.leadList.length} сэжим`">
            <p v-if="!report.leadList.length" class="gks-fbr__muted">Энэ хугацаанд контакт аваагүй.</p>
            <ul v-else class="gks-fbr__leads">
              <li v-for="lead in report.leadList" :key="lead.leadId" class="gks-fbr__lead">
                <div class="gks-fbr__lead-main">
                  <NuxtLink :to="`/admin/consultations/${lead.leadId}`" class="gks-fbr__lead-name">{{ lead.name }}</NuxtLink>
                  <span class="gks-tnum">{{ lead.phone }}</span>
                </div>
                <div class="gks-fbr__lead-meta">
                  <DsBadge :tone="lead.stage === 'WON' ? 'success' : 'neutral'">
                    {{ LEAD_STAGE_LABELS[lead.stage as keyof typeof LEAD_STAGE_LABELS] ?? lead.stage }}
                  </DsBadge>
                  <span>{{ lead.capturedBy === 'AI' ? 'AI авсан' : 'Ажилтан' }}</span>
                  <span class="gks-tnum">{{ formatNumericDateTimeLocal(lead.createdAt) }}</span>
                  <button type="button" class="gks-fbr__link" @click="emit('openThread', lead.threadId)">Чат</button>
                </div>
              </li>
            </ul>
          </DsCard>
        </div>

        <p class="gks-reports__note">
          «Холбогдсон хүн» — энэ хугацаанд Page-д мессеж бичсэн хүн (нэг хүн олон бичсэн ч нэг).
          «Авсан контакт» — Messenger чатаас үүссэн сэжим (AI эсвэл ажилтан бүртгэсэн); өмнө нь вэбээр бүртгүүлсэн хүнийг чаттай
          холбосон бол тооцохгүй.
        </p>

        <FacebookAiCost
          :preset="preset"
          :from="from"
          :to="to"
          :previous-label="previousLabel"
          :stamp="report.generatedAt"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.gks-fbr { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--surface-page); }

.gks-fbr__bar {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-6);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-fbr__period { display: flex; flex-direction: column; margin-right: auto; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-fbr__period strong { color: var(--text-strong); font-weight: var(--fw-semibold); }

.gks-fbr__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
}
.gks-fbr__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-fbr__muted { color: var(--text-subtle); font-size: var(--fs-body-sm); }
.gks-fbr__second { margin-top: var(--sp-3); }

/* Column chart: one series, baseline-anchored, rounded data end. */
.gks-fbr__chart {
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 180px;
}
.gks-fbr__chart--hours { height: 140px; }
.gks-fbr__col {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  cursor: default;
}
.gks-fbr__track { flex: 1; display: flex; align-items: flex-end; border-bottom: var(--border-hair) solid var(--line-soft); }
.gks-fbr__fill {
  display: block;
  width: 100%;
  max-width: 28px;
  margin: 0 auto;
  min-height: 0;
  border-radius: 4px 4px 0 0;
  background: var(--brand-600);
}
.gks-fbr__col:hover .gks-fbr__fill { background: var(--brand-700); }
.gks-fbr__col:hover .gks-fbr__track { background: var(--surface-hover); }
.gks-fbr__axis {
  height: 14px;
  font-size: 10px;
  color: var(--text-subtle);
  text-align: center;
  white-space: nowrap;
  overflow: visible;
}
.gks-fbr__tip {
  position: absolute;
  bottom: calc(100% - 20px);
  left: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 130px;
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  font-size: var(--fs-micro);
  color: var(--text-muted);
  pointer-events: none;
}
.gks-fbr__tip--end { left: auto; right: 0; }
.gks-fbr__tip strong, .gks-fbr__tip b { color: var(--text-strong); }

.gks-fbr__table-wrap { margin-top: var(--sp-4); max-height: 320px; overflow-y: auto; }
.gks-fbr__table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-fbr__table th {
  position: sticky;
  top: 0;
  padding: var(--sp-2) var(--sp-3);
  background: var(--surface-card);
  border-bottom: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
  text-align: right;
}
.gks-fbr__table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); text-align: right; color: var(--text-strong); }
.gks-fbr__table th:first-child, .gks-fbr__table td:first-child { text-align: left; }
.gks-fbr__strong { font-weight: var(--fw-bold); }

.gks-fbr__leads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; max-height: 420px; overflow-y: auto; }
.gks-fbr__lead { display: flex; flex-direction: column; gap: var(--sp-1); padding: var(--sp-2) 0; border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-fbr__lead:last-child { border-bottom: 0; }
.gks-fbr__lead-main { display: flex; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.gks-fbr__lead-name { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-fbr__lead-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-fbr__link { border: 0; padding: 0; background: none; color: var(--brand-600); font-size: inherit; cursor: pointer; text-decoration: underline; }

@media (max-width: 1100px) {
  .gks-fbr__bar, .gks-fbr__body { padding-left: var(--gutter-mobile); padding-right: var(--gutter-mobile); }
}
</style>
