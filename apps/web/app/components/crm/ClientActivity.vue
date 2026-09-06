<script setup lang="ts">
import type { ActivityKind, ClientActivityEntry, ClientDetail, LeadActivityType } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import type { BadgeTone } from '~/utils/labels';

/**
 * Activity tab (1G-17) — one history for the person, newest first: the
 * consultation notes their lead carries, every stage move, every document
 * review, every payment and every back-office task.
 *
 * The server merges the five timelines each module already writes; nothing is
 * duplicated into a new table. Adding a note still writes to the lead's own
 * activity log (1B-03), which is where the office keeps call records.
 */
const props = defineProps<{
  client: ClientDetail;
  entries: ClientActivityEntry[] | null;
}>();

const emit = defineEmits<{ changed: [] }>();

const api = useApi();

const KIND_LABEL: Record<ActivityKind, string> = {
  LEAD: 'Зөвлөгөө',
  STAGE: 'Үе шат',
  DOCUMENT: 'Бичиг баримт',
  PAYMENT: 'Төлбөр',
  TASK: 'Даалгавар',
  APPLICATION: 'Мэдүүлэг',
  VISA: 'Виз',
};

const KIND_TONE: Record<ActivityKind, BadgeTone> = {
  LEAD: 'neutral',
  STAGE: 'info',
  DOCUMENT: 'neutral',
  PAYMENT: 'success',
  TASK: 'warning',
  APPLICATION: 'info',
  VISA: 'info',
};

const KIND_FILTERS: (ActivityKind | 'ALL')[] = ['ALL', 'LEAD', 'STAGE', 'DOCUMENT', 'PAYMENT', 'TASK'];
const filter = ref<ActivityKind | 'ALL'>('ALL');

const shown = computed(() =>
  (props.entries ?? []).filter((entry) => filter.value === 'ALL' || entry.kind === filter.value),
);

// ── New note (writes to the lead's timeline, 1B-03) ────────────────────────
const NOTE_TYPES: LeadActivityType[] = ['NOTE', 'CALL', 'MEETING', 'MESSAGE', 'EMAIL', 'CHAT'];
const noteType = ref<LeadActivityType>('NOTE');
const noteBody = ref('');
const saving = ref(false);
const errorMsg = ref<string | null>(null);

async function addNote() {
  if (!noteBody.value.trim() || !props.client.leadId) return;
  saving.value = true;
  errorMsg.value = null;
  try {
    await api.post(`/leads/${props.client.leadId}/activities`, {
      type: noteType.value,
      body: noteBody.value.trim(),
    });
    noteBody.value = '';
    emit('changed');
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Тэмдэглэл нэмж чадсангүй';
  } finally {
    saving.value = false;
  }
}

/**
 * Enum values arrive raw from the modules that wrote them; the labels are
 * looked up here rather than stored, so a wording change lands in one place.
 */
function titleOf(entry: ClientActivityEntry): string {
  if (entry.kind === 'LEAD') return LEAD_ACTIVITY_TYPE_LABELS[entry.title as LeadActivityType] ?? entry.title;
  if (entry.kind === 'STAGE') {
    const [from, to] = entry.title.split(' → ');
    const label = (stage: string | undefined) =>
      stage ? (CASE_STAGE_LABELS[stage as keyof typeof CASE_STAGE_LABELS] ?? stage) : '';
    return `${label(from)} → ${label(to)}`;
  }
  if (entry.kind === 'PAYMENT') {
    const [kind, status] = entry.title.split(' · ');
    const kindLabel = kind ? (PAYMENT_KIND_LABELS[kind as keyof typeof PAYMENT_KIND_LABELS] ?? kind) : '';
    const statusLabel = status ? (PAYMENT_STATUS_LABELS[status as keyof typeof PAYMENT_STATUS_LABELS] ?? status) : '';
    return `${kindLabel} · ${statusLabel}`;
  }
  return entry.title;
}

function bodyOf(entry: ClientActivityEntry): string | null {
  if (!entry.body) return null;
  if (entry.kind === 'PAYMENT') return formatMntAmount(entry.body);
  if (entry.kind === 'TASK') {
    return WORK_TASK_STATUS_LABELS[entry.body as keyof typeof WORK_TASK_STATUS_LABELS] ?? entry.body;
  }
  return entry.body;
}
</script>

<template>
  <div class="gks-cact">
    <DsCard v-if="client.leadId" title="Тэмдэглэл нэмэх">
      <div class="gks-cact__composer">
        <DsSelect
          v-model="noteType"
          :options="NOTE_TYPES.map((type) => ({ value: type, label: LEAD_ACTIVITY_TYPE_LABELS[type] }))"
          aria-label="Төрөл"
        />
        <DsTextarea v-model="noteBody" placeholder="Дуудлага, уулзалт, тохиролцоо…" :rows="2" />
        <DsButton size="sm" :disabled="!noteBody.trim()" :loading="saving" @click="addNote">Нэмэх</DsButton>
      </div>
      <p v-if="errorMsg" class="gks-cact__error">{{ errorMsg }}</p>
    </DsCard>

    <DsCard title="Түүх">
      <template #action>
        <div class="gks-cact__filters">
          <DsTag v-for="kind in KIND_FILTERS" :key="kind" clickable :selected="filter === kind" @click="filter = kind">
            {{ kind === 'ALL' ? 'Бүгд' : KIND_LABEL[kind] }}
          </DsTag>
        </div>
      </template>

      <div v-if="!entries" class="gks-cact__skeleton" />

      <p v-else-if="!shown.length" class="gks-cact__muted">Тэмдэглэгдсэн үйл ажиллагаа алга байна.</p>

      <ol v-else class="gks-cact__list">
        <li v-for="entry in shown" :key="entry.id" class="gks-cact__item">
          <div class="gks-cact__head">
            <DsBadge :tone="KIND_TONE[entry.kind]">{{ KIND_LABEL[entry.kind] }}</DsBadge>
            <span class="gks-cact__title">{{ titleOf(entry) }}</span>
            <span class="gks-cact__date gks-tnum">{{ formatDateTime(entry.at) }}</span>
          </div>
          <p v-if="bodyOf(entry)" class="gks-cact__body">{{ bodyOf(entry) }}</p>
          <p v-if="entry.actor" class="gks-cact__actor">— {{ entry.actor.name ?? 'Систем' }}</p>
        </li>
      </ol>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-cact { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-cact__composer { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-cact__error { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--danger-fg); }
.gks-cact__filters { display: flex; gap: var(--sp-2); flex-wrap: wrap; }

.gks-cact__list { display: flex; flex-direction: column; }
.gks-cact__item { padding: var(--sp-3) 0; border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-cact__item:last-child { border-bottom: 0; }
.gks-cact__head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.gks-cact__title { flex: 1; min-width: 0; font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.gks-cact__date { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cact__body { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-muted); white-space: pre-wrap; }
.gks-cact__actor { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cact__muted { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-cact__skeleton { height: 200px; background: linear-gradient(var(--n-050), var(--n-100)); }
</style>
