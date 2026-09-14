<script setup lang="ts">
import type { AppointmentStatus, OfficeAppointmentView } from '@gks/shared';

/**
 * 1D-25 — the office visit, from behind the desk.
 *
 * Booking used to exist only in the client's cabinet: staff could neither make
 * an appointment for somebody who phoned in, nor record that they turned up.
 * The originals are listed with what has already been taken in (1D-24), so the
 * question "is this visit still needed?" has an answer on the screen.
 */
const props = defineProps<{ caseId: string; busy?: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();

const view = ref<OfficeAppointmentView | null>(null);
const scheduledAt = ref('');
const note = ref('');
const pending = ref(true);
const working = ref(false);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    view.value = await api.get<OfficeAppointmentView>(`/cases/${props.caseId}/appointments`);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Товлолтыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);
watch(() => props.caseId, load);

async function act(action: () => Promise<unknown>) {
  working.value = true;
  errorMsg.value = null;
  try {
    await action();
    await load();
    emit('changed');
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    working.value = false;
  }
}

const open = computed(() => view.value?.appointments.find((row) => row.status === 'SCHEDULED') ?? null);
const past = computed(() => (view.value?.appointments ?? []).filter((row) => row.status !== 'SCHEDULED'));
const originals = computed(() => view.value?.physicalOriginals ?? []);
const outstanding = computed(() => originals.value.filter((row) => !row.receivedAt));

function book() {
  if (!scheduledAt.value) return;
  return act(async () => {
    await api.post(`/cases/${props.caseId}/appointments`, {
      scheduledAt: new Date(scheduledAt.value).toISOString(),
      note: note.value || undefined,
    });
    scheduledAt.value = '';
    note.value = '';
  });
}

function reschedule() {
  if (!open.value || !scheduledAt.value) return;
  return act(async () => {
    await api.patch(`/office-appointments/${open.value!.id}`, {
      scheduledAt: new Date(scheduledAt.value).toISOString(),
    });
    scheduledAt.value = '';
  });
}

function close(status: AppointmentStatus) {
  if (!open.value) return;
  return act(() => api.patch(`/office-appointments/${open.value!.id}`, { status }));
}
</script>

<template>
  <DsCard title="Оффист ирэх" eyebrow="Эх хувиар авчрах материал">
    <p v-if="errorMsg" class="gks-visit__error">{{ errorMsg }}</p>
    <div v-if="pending && !view" class="gks-visit__skeleton" />

    <template v-else>
      <ul v-if="originals.length" class="gks-visit__originals">
        <li v-for="item in originals" :key="item.id" :class="{ 'gks-visit__original--done': item.receivedAt }">
          <DsIcon :name="item.receivedAt ? 'package-check' : 'briefcase'" :size="14" />
          <span>{{ item.template.nameMn }}</span>
          <span v-if="item.receivedAt" class="gks-visit__taken">
            {{ formatDayMonth(item.receivedAt) }}-нд гардан авсан
          </span>
        </li>
      </ul>
      <p v-else class="gks-visit__muted">Энэ хэрэгт эх хувиар авчрах материал алга байна.</p>

      <div v-if="open" class="gks-visit__booked">
        <div class="gks-visit__booked-when">
          <DsIcon name="calendar-check" :size="16" />
          <span>{{ formatLongDayMonthTime(open.scheduledAt) }}</span>
          <span class="gks-visit__count">{{ outstanding.length }} материал хүлээгдэж байна</span>
        </div>
        <p v-if="open.note" class="gks-visit__note">{{ open.note }}</p>
        <div class="gks-visit__actions">
          <DsButton size="sm" variant="accent" icon-left="check" :disabled="working || busy" @click="close('COMPLETED')">
            Ирсэн
          </DsButton>
          <DsButton size="sm" variant="secondary" icon-left="user-x" :disabled="working || busy" @click="close('NO_SHOW')">
            Ирээгүй
          </DsButton>
          <DsButton size="sm" variant="ghost" icon-left="x" :disabled="working || busy" @click="close('CANCELLED')">
            Цуцлах
          </DsButton>
        </div>
      </div>

      <div class="gks-visit__form">
        <DsInput v-model="scheduledAt" type="datetime-local" :label="open ? 'Өөр цаг рүү шилжүүлэх' : 'Цаг товлох'" />
        <DsInput v-if="!open" v-model="note" label="Тэмдэглэл" placeholder="Заавал биш" />
        <DsButton
          variant="secondary"
          :disabled="!scheduledAt || working || busy"
          @click="open ? reschedule() : book()"
        >
          {{ open ? 'Шилжүүлэх' : 'Товлох' }}
        </DsButton>
      </div>

      <ul v-if="past.length" class="gks-visit__history">
        <li v-for="item in past" :key="item.id">
          <DsBadge tone="neutral">{{ APPOINTMENT_STATUS_LABELS[item.status] }}</DsBadge>
          <span>{{ formatLongDayMonthTime(item.scheduledAt) }}</span>
        </li>
      </ul>
    </template>
  </DsCard>
</template>

<style scoped>
.gks-visit__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-visit__muted { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-visit__skeleton { height: 120px; background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-visit__originals { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-visit__originals li { display: flex; align-items: center; gap: var(--sp-2); }
.gks-visit__original--done { color: var(--success-fg); }
.gks-visit__taken { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-visit__booked {
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--success-bg);
  border: var(--border-hair) solid var(--success-line);
}
.gks-visit__booked-when { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--success-fg); flex-wrap: wrap; }
.gks-visit__count { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-visit__note { margin-top: var(--sp-2); font-size: var(--fs-caption); color: var(--text-muted); }
.gks-visit__actions { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); flex-wrap: wrap; }
.gks-visit__form { display: flex; align-items: flex-end; gap: var(--sp-3); margin-top: var(--sp-4); flex-wrap: wrap; }
.gks-visit__history { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-4); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-visit__history li { display: flex; align-items: center; gap: var(--sp-2); }
</style>
