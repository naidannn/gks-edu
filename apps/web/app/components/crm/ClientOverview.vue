<script setup lang="ts">
import type { ClientAlert, ClientDetail, WorkspaceCase } from '@gks/shared';

/**
 * Overview tab (1G-17) — the four questions an admin opens a client to answer:
 * where are they, what is missing, what happens next, is anything late.
 *
 * Every card here is a summary that links into the tab that owns the detail;
 * none of them is a separate page.
 */
const props = defineProps<{
  client: ClientDetail;
  workspaceCase: WorkspaceCase | null;
  alerts: ClientAlert[];
}>();

type Tab = 'overview' | 'process' | 'documents' | 'payments' | 'activity';
const emit = defineEmits<{ open: [tab: Tab]; changed: [] }>();

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const admission = computed(() => props.workspaceCase?.documents.admission ?? null);

/** Only a GKS case splits its schools into two tracks worth labelling. */
const isScholarshipCase = computed(() => props.workspaceCase?.serviceType === 'GKS_SCHOLARSHIP');

/** The paid/outstanding split, read off the payments the case already carries. */
const money = computed(() => {
  const payments = props.workspaceCase?.payments ?? [];
  const paid = payments
    .filter((row) => row.status === 'PAID' && row.kind !== 'REFUND')
    .reduce((sum, row) => sum + Number(row.amountMnt), 0);
  const pending = payments
    .filter((row) => row.status === 'PENDING')
    .reduce((sum, row) => sum + Number(row.amountMnt), 0);
  const total = Number(props.workspaceCase?.contract?.totalAmountSnapshot ?? 0);
  return { paid, pending, total, remaining: Math.max(0, total - paid) };
});

/** Compact per-area state for the summary strip. */
const summary = computed(() => {
  const row = props.workspaceCase;
  if (!row) return [];
  return [
    {
      key: 'contract',
      icon: 'file-text',
      label: 'Гэрээ',
      value: row.contract ? CONTRACT_STATUS_LABELS[row.contract.status] : 'Үүсээгүй',
      tab: 'payments' as Tab,
    },
    {
      key: 'payment',
      icon: 'credit-card',
      label: 'Төлбөр',
      value: money.value.total > 0 ? `${formatMntAmount(money.value.paid)} / ${formatMntAmount(money.value.total)}` : '—',
      tab: 'payments' as Tab,
    },
    {
      key: 'documents',
      icon: 'file-check-2',
      label: 'Материал',
      value: admission.value && admission.value.requiredTotal > 0
        ? `${admission.value.requiredDone} / ${admission.value.requiredTotal}`
        : 'Жагсаалт үүсээгүй',
      tab: 'documents' as Tab,
    },
    {
      key: 'application',
      icon: 'graduation-cap',
      label: 'Мэдүүлэг',
      value: row.application ? APPLICATION_STATUS_LABELS[row.application.status] : 'Нээгээгүй',
      tab: 'process' as Tab,
    },
    {
      key: 'visa',
      icon: 'plane',
      label: 'Виз',
      value: row.visaCase ? VISA_STATUS_LABELS[row.visaCase.status] : 'Эхлээгүй',
      tab: 'process' as Tab,
    },
  ];
});
</script>

<template>
  <div class="gks-cov">
    <template v-if="workspaceCase">
      <div class="gks-cov__cols">
        <div class="gks-cov__main">
          <CrmClientNextAction :workspace-case="workspaceCase" @open="emit('open', $event)" />

          <DsCard title="Явцын шат" :eyebrow="SERVICE_LABELS[workspaceCase.serviceType]">
            <template #action>
              <button type="button" class="gks-cov__link" @click="emit('open', 'process')">Процесс харах →</button>
            </template>
            <PortalJourneyStepper :journey="workspaceCase.journey" :stage="workspaceCase.stage" />
          </DsCard>

          <DsCard title="Материалын бүрдэлт">
            <template #action>
              <button type="button" class="gks-cov__link" @click="emit('open', 'documents')">Бичиг баримт →</button>
            </template>
            <div class="gks-cov__progress">
              <DocumentsProgressBar :progress="workspaceCase.documents.admission" label="Элсэлтийн материал" />
              <DocumentsProgressBar
                v-if="workspaceCase.documents.visa.requiredTotal > 0"
                :progress="workspaceCase.documents.visa"
                label="Визний материал"
              />
            </div>
          </DsCard>
          <DsCard v-if="workspaceCase.universityChoices.length > 0" title="Сонгосон сургууль">
            <ol class="gks-cov__schools">
              <li v-for="(choice, index) in workspaceCase.universityChoices" :key="choice.id">
                <span class="gks-cov__school-rank">{{ index + 1 }}</span>
                <span class="gks-cov__school-name">{{ universityName(choice.university) }}</span>
                <DsTag v-if="isScholarshipCase && choice.track === 'REGULAR'">нэмэлт энгийн зуучлал</DsTag>
                <span v-if="choice.program" class="gks-cov__school-program">{{ choice.program.nameMn }}</span>
              </li>
            </ol>
            <p v-if="isScholarshipCase" class="gks-cov__note">
              Тэтгэлгийн сонголтоос гадна нэг сургуульд нэмэлт төлбөргүй зуучилна (гэрээний 3.11).
            </p>
          </DsCard>
        </div>

        <aside class="gks-cov__side">
          <CrmClientAlerts :alerts="alerts" @open="emit('open', $event)" />

          <DsCard title="Тойм">
            <ul class="gks-cov__summary">
              <li v-for="item in summary" :key="item.key">
                <button type="button" class="gks-cov__summary-row" @click="emit('open', item.tab)">
                  <DsIcon :name="item.icon" :size="16" />
                  <span class="gks-cov__summary-label">{{ item.label }}</span>
                  <span class="gks-cov__summary-value">{{ item.value }}</span>
                </button>
              </li>
            </ul>
          </DsCard>

          <DsCard title="Холбоо барих">
            <dl class="gks-cov__dl">
              <div><dt>Утас</dt><dd class="gks-tnum">{{ client.phone }}</dd></div>
              <div v-if="client.phoneAlt"><dt>Нэмэлт утас</dt><dd class="gks-tnum">{{ client.phoneAlt }}</dd></div>
              <div><dt>И-мэйл</dt><dd>{{ client.email ?? '—' }}</dd></div>
              <div><dt>Суваг</dt><dd>{{ LEAD_SOURCE_LABELS[client.source] }}</dd></div>
              <div><dt>Бүртгэсэн</dt><dd class="gks-tnum">{{ formatDate(client.createdAt) }}</dd></div>
            </dl>
            <NuxtLink v-if="client.lead" :to="`/admin/consultations/${client.lead.id}`" class="gks-cov__link">
              Зөвлөгөө хүсэлтийн түүх →
            </NuxtLink>
          </DsCard>

          <CrmClientPortalAccess :client="client" @changed="emit('changed')" />

          <DsCard v-if="client.note" title="Тэмдэглэл">
            <p class="gks-cov__note">{{ client.note }}</p>
          </DsCard>
        </aside>
      </div>
    </template>

    <div v-else class="gks-cov__cols">
      <DsCard title="Үйлчилгээ эхлээгүй">
        <p class="gks-cov__empty">
          Энэ үйлчлүүлэгч дээр зуучлалын үйлчилгээ эхлээгүй тул явц, төлбөр, материал хараахан үүсээгүй байна.
        </p>
      </DsCard>

      <aside class="gks-cov__side">
        <CrmClientPortalAccess :client="client" @changed="emit('changed')" />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.gks-cov__cols { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: var(--sp-4); align-items: start; }
.gks-cov__main, .gks-cov__side { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }

.gks-cov__progress { display: flex; flex-direction: column; gap: var(--sp-4); }

.gks-cov__link {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: var(--fs-caption);
  color: var(--brand-700);
  cursor: pointer;
  text-decoration: none;
}
.gks-cov__link:hover { text-decoration: underline; }

.gks-cov__summary { display: flex; flex-direction: column; }
.gks-cov__summary-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) 0;
  border: 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: transparent;
  color: var(--text-muted);
  text-align: left;
  cursor: pointer;
}
.gks-cov__summary li:last-child .gks-cov__summary-row { border-bottom: 0; }
.gks-cov__summary-row:hover { color: var(--text-strong); }
.gks-cov__summary-label { flex: 1; font-size: var(--fs-body-sm); }
.gks-cov__summary-value { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-cov__dl { display: flex; flex-direction: column; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.gks-cov__dl dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cov__dl dd { margin-top: 2px; font-size: var(--fs-body-sm); color: var(--text-strong); }
.gks-cov__schools { display: flex; flex-direction: column; gap: var(--sp-2); margin: 0; padding: 0; list-style: none; }
.gks-cov__schools li { display: flex; align-items: center; gap: var(--sp-2); }
.gks-cov__school-rank { flex: 0 0 auto; width: 1.5rem; height: 1.5rem; display: grid; place-items: center; border-radius: 999px; background: var(--surface-hover); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-cov__school-name { font-weight: 500; }
.gks-cov__school-program { color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-cov__note { font-size: var(--fs-body-sm); white-space: pre-wrap; }
.gks-cov__empty { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 1100px) {
  .gks-cov__cols { grid-template-columns: 1fr; }
}
</style>
