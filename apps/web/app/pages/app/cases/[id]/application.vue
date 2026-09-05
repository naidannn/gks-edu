<script setup lang="ts">
import type { ApplicationView, Invitation, SchoolInvoice, SignedFile } from '@gks/shared';

/** 1E-10 — what the client sees of the school stage: progress, the school's bill, the invitation. */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const config = useRuntimeConfig();
const caseId = computed(() => String(route.params.id));

const view = ref<ApplicationView | null>(null);
const invoices = ref<SchoolInvoice[]>([]);
const invitation = ref<Invitation | null>(null);
const pending = ref(true);

async function load() {
  pending.value = true;
  try {
    [view.value, invoices.value, invitation.value] = await Promise.all([
      api.get<ApplicationView>(`/cases/${caseId.value}/application`),
      api.get<SchoolInvoice[]>(`/cases/${caseId.value}/school-invoices`),
      api.get<Invitation | null>(`/cases/${caseId.value}/invitation`),
    ]);
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const application = computed(() => view.value?.application ?? null);
const readiness = computed(() => view.value?.readiness ?? null);

/** GKS decides twice; regular brokerage once (§7). */
const rounds = computed(() => application.value?.results ?? []);

async function openInvitation() {
  const signed = await api.get<SignedFile>(`/cases/${caseId.value}/invitation/url`);
  window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
}
</script>

<template>
  <div class="gks-app-stage">
    <DsCard v-if="application" title="Мэдүүлгийн явц">
      <template #action>
        <DsBadge :tone="APPLICATION_STATUS_TONE[application.status]">
          {{ APPLICATION_STATUS_LABELS[application.status] }}
        </DsBadge>
      </template>

      <dl class="gks-app-stage__facts">
        <div>
          <dt>Сургууль</dt>
          <dd>{{ universityName(application.university, UNKNOWN_LABEL) }}</dd>
        </div>
        <div>
          <dt>Хөтөлбөр</dt>
          <dd>{{ application.program?.nameMn ?? UNKNOWN_LABEL }}</dd>
        </div>
        <div>
          <dt>Илгээсэн</dt>
          <dd class="gks-tnum">{{ formatDate(application.submittedAt) }}</dd>
        </div>
        <div v-if="application.applicationNo">
          <dt>Бүртгэлийн дугаар</dt>
          <dd class="gks-tnum">{{ application.applicationNo }}</dd>
        </div>
      </dl>

      <div v-if="application.interviewAt" class="gks-app-stage__interview">
        <h3><DsIcon name="calendar-clock" :size="16" /> Ярилцлага</h3>
        <p class="gks-tnum">{{ formatDate(application.interviewAt) }}</p>
        <p v-if="application.interviewNote">{{ application.interviewNote }}</p>
      </div>

      <ul v-if="rounds.length" class="gks-app-stage__rounds">
        <li v-for="result in rounds" :key="result.id">
          <span class="gks-app-stage__round">{{ result.round }}-р шат</span>
          <DsBadge :tone="result.decision === 'PASSED' ? 'success' : result.decision === 'FAILED' ? 'danger' : 'warning'">
            {{ APPLICATION_DECISION_LABELS[result.decision] }}
          </DsBadge>
          <span class="gks-tnum">{{ formatDate(result.decidedAt) }}</span>
        </li>
      </ul>
    </DsCard>

    <DsCard v-else-if="!pending" title="Мэдүүлэг">
      <p class="gks-app-stage__empty">Материал бүрдсэний дараа сургуулийн мэдүүлгийн үе шат нээгдэнэ.</p>
    </DsCard>

    <!-- 1E-03: the gate, stated as the remaining work rather than as an error. -->
    <DsCard v-if="readiness && !readiness.isReady" title="Мэдүүлэхийн өмнө" accent>
      <p class="gks-app-stage__gate">
        Дараах {{ readiness.missing.length }} материал бүрдвэл сургуульд мэдүүлэх боломжтой болно:
      </p>
      <ul class="gks-app-stage__missing">
        <li v-for="item in readiness.missing" :key="item.id">
          <DsIcon name="circle-alert" :size="14" />
          <span>{{ item.nameMn }}</span>
          <DsBadge :tone="DOCUMENT_STATUS_TONE[item.status]">{{ DOCUMENT_STATUS_LABELS[item.status] }}</DsBadge>
        </li>
      </ul>
      <NuxtLink :to="`/app/cases/${caseId}/documents`" class="gks-app-stage__link">Материал руу очих →</NuxtLink>
    </DsCard>

    <DsCard v-for="invoice in invoices" :key="invoice.id" title="Сургуулийн нэхэмжлэх">
      <template #action>
        <DsBadge :tone="invoice.status === 'PAID' || invoice.status === 'CONFIRMED_BY_SCHOOL' ? 'success' : 'info'">
          {{ SCHOOL_INVOICE_STATUS_LABELS[invoice.status] }}
        </DsBadge>
      </template>

      <table class="gks-app-stage__table">
        <tbody>
          <tr v-for="item in invoice.items" :key="item.id">
            <td>{{ item.labelMn }}</td>
            <td class="gks-tnum">{{ formatKrwAmount(item.amountKrw) }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <th>Нийт (вон)</th>
            <th class="gks-tnum">{{ formatKrwAmount(invoice.totalKrw) }}</th>
          </tr>
          <tr>
            <th>Төгрөгийн дүн (ханш {{ Number(invoice.fxRate) }}₮)</th>
            <th class="gks-tnum">{{ formatMntAmount(invoice.amountMnt) }}</th>
          </tr>
          <tr v-if="Number(invoice.transferFeeMnt) > 0">
            <th>Шилжүүлгийн шимтгэл</th>
            <th class="gks-tnum">{{ formatMntAmount(invoice.transferFeeMnt) }}</th>
          </tr>
        </tfoot>
      </table>

      <p v-if="invoice.dueAt" class="gks-app-stage__due gks-tnum">Эцсийн хугацаа: {{ formatDate(invoice.dueAt) }}</p>
      <p v-if="invoice.receivedBySchoolAt" class="gks-app-stage__ok">
        <DsIcon name="check" :size="14" /> Сургууль төлбөрийг хүлээн авсан
      </p>
    </DsCard>

    <DsCard v-if="invitation" title="Суралцах урилга">
      <p class="gks-app-stage__invitation">
        <DsIcon name="mail-check" :size="16" />
        <span>
          {{ invitation.number ? `Дугаар ${invitation.number} · ` : '' }}{{ formatDate(invitation.issuedAt ?? invitation.receivedAt) }}
        </span>
      </p>
      <p v-if="invitation.note" class="gks-app-stage__note">{{ invitation.note }}</p>
      <DsButton v-if="invitation.filePath" size="sm" variant="secondary" icon-left="download" @click="openInvitation">
        Урилга татах
      </DsButton>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-app-stage { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-app-stage__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-4); }
.gks-app-stage__facts dt { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
.gks-app-stage__facts dd { font-size: var(--fs-body-sm); color: var(--text-body); margin-top: 2px; }

.gks-app-stage__interview { margin-top: var(--sp-4); padding: var(--sp-3); border-radius: var(--radius-2); background: var(--info-bg); border: var(--border-hair) solid var(--info-line); color: var(--info-fg); }
.gks-app-stage__interview h3 { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-label); font-weight: var(--fw-semibold); }
.gks-app-stage__interview p { margin-top: var(--sp-1); font-size: var(--fs-body-sm); }

.gks-app-stage__rounds { margin-top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-app-stage__rounds li { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.gks-app-stage__round { font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-app-stage__gate { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-app-stage__missing { margin: var(--sp-3) 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-app-stage__missing li { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-app-stage__link { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--brand-700); text-decoration: none; }

.gks-app-stage__table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-app-stage__table td, .gks-app-stage__table th { padding: var(--sp-2) 0; text-align: left; }
.gks-app-stage__table td:last-child, .gks-app-stage__table th:last-child { text-align: right; }
.gks-app-stage__table tfoot th { border-top: var(--border-hair) solid var(--line-hairline); font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-app-stage__due { margin-top: var(--sp-3); font-size: var(--fs-caption); color: var(--text-muted); }
.gks-app-stage__ok { margin-top: var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--success-fg); }
.gks-app-stage__invitation { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-app-stage__note { margin: var(--sp-2) 0 var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-app-stage__empty { color: var(--text-subtle); font-style: italic; }
</style>
