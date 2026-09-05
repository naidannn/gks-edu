<script setup lang="ts">
import type { NotificationChannel, NotificationEvent, NotificationTemplateItem, SmsUsage } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import {
  NOTIFICATION_CHANNEL_LABELS,
  NOTIFICATION_EVENT_GROUPS,
  NOTIFICATION_EVENT_LABELS,
} from '~/utils/notifications';

/**
 * 1G-06 — the §16 notification catalogue: which events send on which channel,
 * and the Mongolian wording of each. Editing here never touches notifications
 * already sent; those keep the text they were rendered with.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Мэдэгдлийн загвар' });

/** Written as data, not literals: `{{` inside a template is an interpolation. */
const PLACEHOLDER_EXAMPLES = ['{{clientName}}', '{{caseCode}}', '{{link}}'];
const LINK_HINT = 'Жишээ: /app/cases/{{caseId}}/documents';

const api = useApi();
const templates = ref<NotificationTemplateItem[]>([]);
const smsUsage = ref<SmsUsage | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);
const editingId = ref<string | null>(null);
const draft = reactive({ titleMn: '', bodyMn: '', linkMn: '' });
const saving = ref(false);

async function load() {
  pending.value = true;
  try {
    const [rows, usage] = await Promise.all([
      api.get<NotificationTemplateItem[]>('/notifications/templates'),
      api.get<SmsUsage>('/notifications/sms-usage').catch(() => null),
    ]);
    templates.value = rows;
    smsUsage.value = usage;
  } catch {
    errorMsg.value = 'Загваруудыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

function forEvent(event: NotificationEvent): NotificationTemplateItem[] {
  const order: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS', 'PUSH'];
  return templates.value
    .filter((row) => row.event === event)
    .sort((a, b) => order.indexOf(a.channel) - order.indexOf(b.channel));
}

function startEdit(row: NotificationTemplateItem) {
  editingId.value = row.id;
  draft.titleMn = row.titleMn;
  draft.bodyMn = row.bodyMn;
  draft.linkMn = row.linkMn ?? '';
}

async function save(row: NotificationTemplateItem) {
  saving.value = true;
  errorMsg.value = null;
  try {
    const updated = await api.patch<NotificationTemplateItem>(`/notifications/templates/${row.id}`, {
      titleMn: draft.titleMn,
      bodyMn: draft.bodyMn,
      linkMn: draft.linkMn || undefined,
    });
    Object.assign(row, updated);
    editingId.value = null;
    notice.value = 'Загвар хадгалагдлаа.';
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Хадгалж чадсангүй';
  } finally {
    saving.value = false;
  }
}

async function toggleActive(row: NotificationTemplateItem) {
  try {
    const updated = await api.patch<NotificationTemplateItem>(`/notifications/templates/${row.id}`, {
      isActive: !row.isActive,
    });
    Object.assign(row, updated);
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Өөрчилж чадсангүй';
  }
}

async function seedMissing() {
  try {
    const result = await api.post<{ created: number; existing: number }>('/notifications/templates/seed');
    notice.value = `${result.created} шинэ загвар нэмэгдлээ (${result.existing} хэвээр).`;
    await load();
  } catch {
    errorMsg.value = 'Загвар нөхөж чадсангүй';
  }
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">§16</span>
        <h1 class="gks-page__title">Мэдэгдлийн загвар</h1>
        <p class="gks-page__hint">
          <code v-for="name in PLACEHOLDER_EXAMPLES" :key="name">{{ name }}</code>
          зэрэг орлуулга илгээх үед бөглөгдөнө.
          Систем доторх мэдэгдлийг унтраах боломжгүй — зөвхөн имэйл, SMS-ийг унтраана.
        </p>
      </div>
      <DsButton variant="secondary" size="sm" icon-left="plus" @click="seedMissing">Дутууг нөхөх</DsButton>
    </header>

    <DsCard v-if="smsUsage" title="Өнөөдрийн SMS зарцуулалт" eyebrow="1G-04">
      <div class="gks-ntpl__usage">
        <span>Илгээсэн: <strong class="gks-tnum">{{ smsUsage.sent }}</strong> / {{ smsUsage.dailyLimit }}</span>
        <span>Амжилтгүй: <strong class="gks-tnum">{{ smsUsage.failed }}</strong></span>
        <span>Нэг хэрэглэгчийн өдрийн хязгаар: <strong class="gks-tnum">{{ smsUsage.perUserLimit }}</strong></span>
      </div>
    </DsCard>

    <p v-if="errorMsg" class="gks-ntpl__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-ntpl__notice">{{ notice }}</p>
    <p v-if="pending" class="gks-page__hint">Уншиж байна…</p>

    <DsCard v-for="group in NOTIFICATION_EVENT_GROUPS" v-show="!pending" :key="group.title" :title="group.title">
      <div v-for="event in group.events" :key="event" class="gks-ntpl__event">
        <p class="gks-ntpl__event-title">{{ NOTIFICATION_EVENT_LABELS[event] }}</p>

        <div v-for="row in forEvent(event)" :key="row.id" class="gks-ntpl__row">
          <div class="gks-ntpl__row-head">
            <DsBadge :tone="row.channel === 'SMS' ? 'warning' : 'neutral'">
              {{ NOTIFICATION_CHANNEL_LABELS[row.channel] }}
            </DsBadge>
            <span class="gks-ntpl__row-title">{{ row.titleMn }}</span>
            <div class="gks-ntpl__row-actions">
              <DsSwitch
                :model-value="row.isActive"
                :disabled="row.channel === 'IN_APP'"
                :label="row.isActive ? 'Идэвхтэй' : 'Идэвхгүй'"
                @update:model-value="toggleActive(row)"
              />
              <DsButton variant="secondary" size="sm" icon-left="pencil" @click="startEdit(row)">Засах</DsButton>
            </div>
          </div>

          <pre v-if="editingId !== row.id" class="gks-ntpl__body">{{ row.bodyMn }}</pre>

          <form v-else class="gks-ntpl__form" @submit.prevent="save(row)">
            <DsInput v-model="draft.titleMn" label="Гарчиг" required />
            <DsTextarea v-model="draft.bodyMn" label="Агуулга" :rows="8" required />
            <DsInput v-model="draft.linkMn" label="Холбоос" :hint="LINK_HINT" />
            <div class="gks-form-actions">
              <DsButton type="submit" variant="accent" size="sm" :disabled="saving">
                {{ saving ? 'Хадгалж байна…' : 'Хадгалах' }}
              </DsButton>
              <DsButton variant="secondary" size="sm" @click="editingId = null">Болих</DsButton>
            </div>
          </form>
        </div>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-page__hint code { font-family: var(--font-mono); font-size: var(--fs-micro); }
.gks-ntpl__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-ntpl__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-ntpl__usage { display: flex; gap: var(--sp-5); flex-wrap: wrap; font-size: var(--fs-body-sm); }
.gks-ntpl__event { padding: var(--sp-4) 0; border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-ntpl__event:last-child { border-bottom: none; }
.gks-ntpl__event-title { font-weight: var(--fw-semibold); margin-bottom: var(--sp-2); }
.gks-ntpl__row { padding: var(--sp-3) 0; }
.gks-ntpl__row-head { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.gks-ntpl__row-title { font-size: var(--fs-body-sm); flex: 1; min-width: 200px; }
.gks-ntpl__row-actions { display: flex; align-items: center; gap: var(--sp-3); }
.gks-ntpl__body {
  margin: var(--sp-2) 0 0;
  padding: var(--sp-3);
  background: var(--surface-page);
  border-radius: var(--radius-2);
  font-family: var(--font-mono);
  font-size: var(--fs-micro);
  white-space: pre-wrap;
  color: var(--text-subtle);
}
.gks-ntpl__form { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>

