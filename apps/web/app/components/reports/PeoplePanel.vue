<script setup lang="ts">
import type {
  ConsultationReportRow,
  PeopleReport,
  ReportMailResult,
  ReportRecipient,
  ReportWorkbook,
} from '@gks/shared';
import type { ReportQuery } from '~/utils/reports';

/**
 * 1M-11 — the people behind the overview's "шинэ сэжим" and "шинэ
 * үйлчлүүлэгч": who became a client, who asked for a consultation and who got
 * one, each downloadable as Excel and mailable to a colleague.
 *
 * The mail goes to staff accounts picked from a list, never to a typed
 * address — these files are names and phone numbers, and the server refuses
 * anybody who is not an active admin or consultant anyway.
 */
const props = defineProps<{ report: PeopleReport; query: ReportQuery }>();

const api = useApi();

const WORKBOOKS: { key: ReportWorkbook; label: string; description: string }[] = [
  { key: 'clients', label: 'Үйлчлүүлэгч болсон хүмүүс', description: 'Хугацаанд бүртгэгдсэн үйлчлүүлэгчид' },
  { key: 'consultations', label: 'Зөвлөгөө хүссэн, авсан хүмүүс', description: 'Хоёр хуудастай: хүссэн, авсан' },
];

const errorMsg = ref<string | null>(null);

// ── Excel download ─────────────────────────────────────────────────────────

const downloading = ref<ReportWorkbook | null>(null);

/** Fetched, not linked: the bearer token lives in memory, a bare `<a href>` would 401. */
async function downloadExcel(kind: ReportWorkbook) {
  downloading.value = kind;
  errorMsg.value = null;
  try {
    const search = reportQueryString(props.query, { report: kind });
    const blob = await api.request<Blob>(`/reports/excel?${search}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = workbookFilename(props.report.period, kind);
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Excel файл татаж чадсангүй';
  } finally {
    downloading.value = null;
  }
}

// ── Mail ───────────────────────────────────────────────────────────────────

const mailOpen = ref(false);
const recipients = ref<ReportRecipient[] | null>(null);
const chosenRecipients = ref<Set<string>>(new Set());
const chosenWorkbooks = ref<Set<ReportWorkbook>>(new Set(['clients', 'consultations']));
const sending = ref(false);
const mailResult = ref<ReportMailResult | null>(null);

async function openMail() {
  mailOpen.value = !mailOpen.value;
  mailResult.value = null;
  if (!mailOpen.value || recipients.value) return;
  try {
    recipients.value = await api.get<ReportRecipient[]>('/reports/email/recipients');
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Хүлээн авагчдыг ачаалж чадсангүй';
  }
}

/** A new `Set` each time, so the checkboxes re-render. */
function toggled<T>(set: Set<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}
const toggleWorkbook = (key: ReportWorkbook, on: boolean) => (chosenWorkbooks.value = toggled(chosenWorkbooks.value, key, on));
const toggleRecipient = (id: string, on: boolean) => (chosenRecipients.value = toggled(chosenRecipients.value, id, on));

const canSend = computed(() => chosenRecipients.value.size > 0 && chosenWorkbooks.value.size > 0 && !sending.value);

async function send() {
  sending.value = true;
  errorMsg.value = null;
  mailResult.value = null;
  try {
    mailResult.value = await api.post<ReportMailResult>('/reports/email', {
      ...periodBody(props.query),
      workbooks: WORKBOOKS.map((item) => item.key).filter((key) => chosenWorkbooks.value.has(key)),
      recipientIds: [...chosenRecipients.value],
    });
    if (!mailResult.value.failed.length) chosenRecipients.value = new Set();
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'И-мэйл илгээж чадсангүй';
  } finally {
    sending.value = false;
  }
}

// ── Tables ─────────────────────────────────────────────────────────────────

const consultationView = ref<'requested' | 'consulted'>('requested');
const consultationRows = computed<ConsultationReportRow[]>(() =>
  consultationView.value === 'requested' ? props.report.requested : props.report.consulted,
);

const fullName = (row: { lastName: string; firstName: string }) => `${row.lastName} ${row.firstName}`.trim();
</script>

<template>
  <DsCard :title="`Хүмүүс · ${report.period.labelMn}`">
    <template #action>
      <DsButton variant="secondary" size="sm" icon-left="mail" @click="openMail">
        Имэйлээр илгээх
      </DsButton>
    </template>

    <div class="gks-stats">
      <div class="gks-stat gks-stat--success">
        <span class="gks-stat__label">Үйлчлүүлэгч болсон</span>
        <span class="gks-stat__value gks-tnum">{{ report.clients.length }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Зөвлөгөө хүссэн</span>
        <span class="gks-stat__value gks-tnum">{{ report.requested.length }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Зөвлөгөө авсан</span>
        <span class="gks-stat__value gks-tnum">{{ report.consulted.length }}</span>
      </div>
    </div>
    <p class="gks-reports__note">
      «Зөвлөгөө авсан» нь энэ хугацаанд анх зөвлөгөө өгсөн хүсэлтүүд — хүсэлт нь өмнөх хугацаанд ирсэн байж болно.
      Вэбээр бүртгүүлээд орхисон бүртгэл үйлчлүүлэгчийн жагсаалтад орохгүй.
    </p>

    <section v-if="mailOpen" class="gks-people__mail" aria-label="Имэйлээр илгээх">
      <div class="gks-people__mail-col">
        <p class="gks-people__mail-title">Хавсаргах Excel</p>
        <DsCheckbox
          v-for="item in WORKBOOKS"
          :key="item.key"
          :label="item.label"
          :description="item.description"
          :model-value="chosenWorkbooks.has(item.key)"
          @update:model-value="(on: boolean) => toggleWorkbook(item.key, on)"
        />
      </div>
      <div class="gks-people__mail-col">
        <p class="gks-people__mail-title">Хүлээн авагч</p>
        <p v-if="!recipients" class="gks-reports__note">Уншиж байна…</p>
        <p v-else-if="!recipients.length" class="gks-reports__note">И-мэйлтэй идэвхтэй ажилтан алга.</p>
        <div v-else class="gks-people__recipients">
          <DsCheckbox
            v-for="person in recipients"
            :key="person.id"
            :label="person.name ?? person.email"
            :description="`${person.email} · ${ROLE_LABELS[person.role] ?? person.role}`"
            :model-value="chosenRecipients.has(person.id)"
            @update:model-value="(on: boolean) => toggleRecipient(person.id, on)"
          />
        </div>
      </div>
      <div class="gks-people__mail-foot">
        <DsButton size="sm" icon-left="send" :disabled="!canSend" @click="send">
          {{ sending ? 'Илгээж байна…' : `Илгээх (${chosenRecipients.size})` }}
        </DsButton>
        <span class="gks-reports__note">Зөвхөн идэвхтэй админ, зөвлөхийн бүртгэлтэй хаяг руу илгээнэ.</span>
      </div>
      <p v-if="mailResult?.sent.length" class="gks-people__ok">
        Илгээлээ: {{ mailResult.sent.join(', ') }}
      </p>
      <p v-if="mailResult?.failed.length" class="gks-people__error">
        Явсангүй: {{ mailResult.failed.map((item) => item.email).join(', ') }}
      </p>
    </section>

    <p v-if="errorMsg" class="gks-people__error">{{ errorMsg }}</p>
  </DsCard>

  <DsCard title="Үйлчлүүлэгч болсон" :eyebrow="`${report.clients.length} хүн`">
    <template #action>
      <button type="button" class="gks-reports__download" :disabled="downloading === 'clients'" @click="downloadExcel('clients')">
        <DsIcon name="download" :size="14" /> Excel
      </button>
    </template>

    <div v-if="report.clients.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Код</th>
            <th scope="col">Үйлчлүүлэгч</th>
            <th scope="col">Утас</th>
            <th scope="col">Үйлчилгээ</th>
            <th scope="col">Зөвлөх</th>
            <th scope="col">Төлөв</th>
            <th scope="col">Бүртгэсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.clients" :key="row.clientId">
            <td><NuxtLink :to="`/admin/clients/${row.clientId}`">{{ row.code }}</NuxtLink></td>
            <td>
              {{ fullName(row) }}
              <span class="gks-reports__sub">{{ LEAD_SOURCE_LABELS[row.source] }}</span>
            </td>
            <td class="gks-tnum">{{ row.phone }}</td>
            <td>
              {{ SERVICE_LABELS[row.serviceType] }}
              <span v-if="row.universityNameMn" class="gks-reports__sub">{{ row.universityNameMn }}</span>
            </td>
            <td>{{ row.consultantName ?? '—' }}</td>
            <td><DsBadge :tone="CLIENT_PHASE_TONE[row.phase]">{{ CLIENT_PHASE_LABELS[row.phase] }}</DsBadge></td>
            <td class="gks-tnum">{{ formatNumericDateLocal(row.registeredAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Энэ хугацаанд үйлчлүүлэгч бүртгэгдээгүй.</p>
  </DsCard>

  <DsCard title="Зөвлөгөө хүссэн, авсан">
    <template #action>
      <button
        type="button"
        class="gks-reports__download"
        :disabled="downloading === 'consultations'"
        @click="downloadExcel('consultations')"
      >
        <DsIcon name="download" :size="14" /> Excel
      </button>
    </template>

    <div class="gks-people__switch" role="group" aria-label="Зөвлөгөөний жагсаалт">
      <button
        type="button"
        class="gks-people__seg"
        :aria-pressed="consultationView === 'requested'"
        @click="consultationView = 'requested'"
      >
        Хүссэн <span class="gks-tnum">({{ report.requested.length }})</span>
      </button>
      <button
        type="button"
        class="gks-people__seg"
        :aria-pressed="consultationView === 'consulted'"
        @click="consultationView = 'consulted'"
      >
        Авсан <span class="gks-tnum">({{ report.consulted.length }})</span>
      </button>
    </div>

    <div v-if="consultationRows.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Нэр</th>
            <th scope="col">Утас</th>
            <th scope="col">Суваг</th>
            <th scope="col">Хариуцсан</th>
            <th scope="col">Үе шат</th>
            <th scope="col">Хүсэлт ирсэн</th>
            <th scope="col">Зөвлөгөө авсан</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in consultationRows" :key="row.leadId">
            <td>
              <NuxtLink :to="`/admin/consultations/${row.leadId}`">{{ fullName(row) }}</NuxtLink>
              <span v-if="row.clientCode" class="gks-reports__sub">Үйлчлүүлэгч: {{ row.clientCode }}</span>
            </td>
            <td class="gks-tnum">{{ row.phone }}</td>
            <td>{{ LEAD_SOURCE_LABELS[row.source] }}</td>
            <td>{{ row.assignedToName ?? '—' }}</td>
            <td><DsBadge :tone="LEAD_STAGE_TONE[row.stage]">{{ LEAD_STAGE_LABELS[row.stage] }}</DsBadge></td>
            <td class="gks-tnum">{{ formatNumericDateLocal(row.requestedAt) }}</td>
            <td class="gks-tnum">{{ row.consultedAt ? formatNumericDateLocal(row.consultedAt) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">
      {{ consultationView === 'requested' ? 'Энэ хугацаанд зөвлөгөөний хүсэлт ирээгүй.' : 'Энэ хугацаанд зөвлөгөө өгсөн бүртгэл алга.' }}
    </p>
  </DsCard>
</template>

<style scoped>
.gks-people__mail {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: var(--sp-4);
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.gks-people__mail-title {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-people__recipients { max-height: 320px; overflow-y: auto; }
.gks-people__mail-foot {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}
.gks-people__mail-foot .gks-reports__note { margin-top: 0; }
.gks-people__ok { grid-column: 1 / -1; color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-people__error { margin-top: var(--sp-3); color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-people__switch {
  display: inline-flex;
  gap: var(--sp-1);
  margin-bottom: var(--sp-3);
  padding: 2px;
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
}
.gks-people__seg {
  padding: var(--sp-1) var(--sp-3);
  border: 0;
  border-radius: var(--radius-1);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-people__seg[aria-pressed='true'] {
  background: var(--brand-050);
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
}
</style>
