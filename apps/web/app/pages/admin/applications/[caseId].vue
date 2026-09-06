<script setup lang="ts">
import type {
  ApplicationDecision,
  ApplicationStatus,
  ApplicationView,
  DocumentTemplate,
  FxRate,
  Invitation,
  InvoiceItemKind,
  SchoolInvoice,
} from '@gks/shared';

/**
 * 1E-11 — the staff console for one case's school stage: move the application,
 * book the interview, add the paperwork a school asked for, record the decision,
 * price the school's invoice, and register the invitation that opens the visa.
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });

const route = useRoute();
const api = useApi();
const caseId = computed(() => String(route.params.caseId));

const view = ref<ApplicationView | null>(null);
const invoices = ref<SchoolInvoice[]>([]);
const invitation = ref<Invitation | null>(null);
const templates = ref<DocumentTemplate[]>([]);
const fx = ref<FxRate | null>(null);
const pending = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const application = computed(() => view.value?.application ?? null);
const readiness = computed(() => view.value?.readiness ?? null);

async function load() {
  pending.value = true;
  error.value = null;
  try {
    const [appView, invoiceList, letter, templateList, rate] = await Promise.all([
      api.get<ApplicationView>(`/cases/${caseId.value}/application`),
      api.get<SchoolInvoice[]>(`/cases/${caseId.value}/school-invoices`),
      api.get<Invitation | null>(`/cases/${caseId.value}/invitation`),
      api.get<DocumentTemplate[]>('/document-templates'),
      api.get<FxRate>('/fx-rates/current'),
    ]);
    view.value = appView;
    invoices.value = invoiceList;
    invitation.value = letter;
    templates.value = templateList;
    fx.value = rate;
    invoiceForm.fxRate = String(rate.rate);
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = false;
  }
}

function open() {
  return act(() => api.post(`/cases/${caseId.value}/application`, {}));
}

/** Only the moves the API will actually accept from here (1E-02). */
const NEXT_STATUSES: Record<ApplicationStatus, ApplicationStatus[]> = {
  PREPARING: ['READY'],
  READY: ['SUBMITTED', 'PREPARING'],
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ADDITIONAL_DOCS_REQUESTED', 'INTERVIEW_SCHEDULED'],
  ADDITIONAL_DOCS_REQUESTED: ['UNDER_REVIEW'],
  INTERVIEW_SCHEDULED: ['UNDER_REVIEW'],
  DEFERRED: ['UNDER_REVIEW'],
  ACCEPTED: [],
  REJECTED: [],
};
const nextStatuses = computed(() => (application.value ? NEXT_STATUSES[application.value.status] : []));

function transition(toStatus: ApplicationStatus) {
  return act(() => api.post(`/applications/${application.value!.id}/transitions`, { toStatus }));
}

// ── Interview (1E-05)
const interview = reactive({ at: '', note: '' });
function scheduleInterview() {
  return act(() =>
    api.post(`/applications/${application.value!.id}/interview`, {
      interviewAt: new Date(interview.at).toISOString(),
      interviewNote: interview.note || undefined,
    }),
  );
}

// ── Additional documents (1E-04)
const extraDocs = reactive({ templateIds: [] as string[], dueAt: '', note: '' });
function requestDocs() {
  return act(() =>
    api.post(`/applications/${application.value!.id}/additional-documents`, {
      templateIds: extraDocs.templateIds,
      dueAt: extraDocs.dueAt ? new Date(extraDocs.dueAt).toISOString() : undefined,
      note: extraDocs.note || undefined,
    }),
  ).then(() => { extraDocs.templateIds = []; extraDocs.note = ''; });
}

// ── Decision (1E-02)
const isGks = computed(() => application.value?.case.serviceType === 'GKS_SCHOLARSHIP');
const result = reactive({ round: '1', decision: 'PASSED' as ApplicationDecision, note: '' });
function recordResult() {
  return act(() =>
    api.post(`/applications/${application.value!.id}/results`, {
      round: Number(result.round),
      decision: result.decision,
      note: result.note || undefined,
    }),
  );
}

// ── School invoice (1E-06/1E-08)
const invoiceForm = reactive({
  items: [{ kind: 'TUITION' as InvoiceItemKind, labelMn: 'Сургалтын төлбөр', amountKrw: '' }],
  fxRate: '',
  transferFeeMnt: '',
  dueAt: '',
});
const invoiceTotalKrw = computed(() => invoiceForm.items.reduce((sum, item) => sum + (Number(item.amountKrw) || 0), 0));
const invoiceTotalMnt = computed(() => Math.round(invoiceTotalKrw.value * (Number(invoiceForm.fxRate) || 0)));

function addInvoiceLine() {
  invoiceForm.items.push({ kind: 'OTHER', labelMn: '', amountKrw: '' });
}
function createInvoice() {
  return act(() =>
    api.post(`/cases/${caseId.value}/school-invoices`, {
      items: invoiceForm.items
        .filter((item) => Number(item.amountKrw) > 0)
        .map((item) => ({ kind: item.kind, labelMn: item.labelMn || INVOICE_ITEM_KIND_LABELS[item.kind], amountKrw: Number(item.amountKrw) })),
      fxRate: Number(invoiceForm.fxRate) || undefined,
      transferFeeMnt: Number(invoiceForm.transferFeeMnt) || undefined,
      dueAt: invoiceForm.dueAt ? new Date(invoiceForm.dueAt).toISOString() : undefined,
    }),
  );
}
function markInvoicePaid(id: string) {
  return act(() => api.patch(`/school-invoices/${id}`, { status: 'PAID', paidAt: new Date().toISOString() }));
}
function markInvoiceConfirmed(id: string) {
  return act(() =>
    api.patch(`/school-invoices/${id}`, { status: 'CONFIRMED_BY_SCHOOL', receivedBySchoolAt: new Date().toISOString() }),
  );
}

// ── Invitation (1E-09)
const invitationForm = reactive({ number: '', issuedAt: '', note: '' });
const invitationFile = ref<File | null>(null);
function recordInvitation() {
  const body = new FormData();
  if (invitationForm.number) body.append('number', invitationForm.number);
  if (invitationForm.issuedAt) body.append('issuedAt', new Date(invitationForm.issuedAt).toISOString());
  if (invitationForm.note) body.append('note', invitationForm.note);
  if (invitationFile.value) body.append('file', invitationFile.value);
  return act(() => api.post(`/cases/${caseId.value}/invitation`, body));
}

const KIND_OPTIONS = (Object.entries(INVOICE_ITEM_KIND_LABELS) as [InvoiceItemKind, string][]).map(([value, label]) => ({ value, label }));
const DECISION_OPTIONS = (Object.entries(APPLICATION_DECISION_LABELS) as [ApplicationDecision, string][]).map(([value, label]) => ({ value, label }));

useHead({ title: 'Мэдүүлгийн удирдлага · CRM' });
</script>

<template>
  <div class="gks-page">
    <NuxtLink to="/admin/applications" class="gks-page__back"><DsIcon name="arrow-left" :size="16" /> Мэдүүлэг</NuxtLink>
    <p v-if="error" class="gks-appadm__error">{{ error }}</p>

    <DsCard v-if="!application && !pending" title="Мэдүүлэг нээгдээгүй">
      <p class="gks-muted">Энэ үйлчилгээнд сургуулийн мэдүүлэг үүсээгүй байна.</p>
      <DsButton variant="accent" :loading="busy" @click="open">Мэдүүлэг нээх</DsButton>
    </DsCard>

    <template v-if="application">
      <DsCard :title="application.case.code" :eyebrow="SERVICE_LABELS[application.case.serviceType]">
        <template #action>
          <DsBadge :tone="APPLICATION_STATUS_TONE[application.status]">{{ APPLICATION_STATUS_LABELS[application.status] }}</DsBadge>
        </template>

        <dl class="gks-facts">
          <div><dt>Хэрэглэгч</dt><dd>{{ application.case.user?.name ?? '—' }}</dd></div>
          <div><dt>Сургууль</dt><dd>{{ universityName(application.university, UNKNOWN_LABEL) }}</dd></div>
          <div><dt>Илгээсэн</dt><dd class="gks-tnum">{{ formatDate(application.submittedAt) }}</dd></div>
          <div><dt>Материал</dt><dd class="gks-tnum">{{ readiness?.requiredTotal ?? 0 }}-с {{ (readiness?.requiredTotal ?? 0) - (readiness?.missing.length ?? 0) }} бүрдсэн</dd></div>
        </dl>

        <p v-if="readiness && !readiness.isReady" class="gks-appadm__gate">
          <DsIcon name="lock" :size="14" />
          Дутуу: {{ readiness.missing.map((m) => m.nameMn).join(', ') }}
        </p>

        <div class="gks-appadm__actions">
          <DsButton
            v-for="status in nextStatuses"
            :key="status"
            size="sm"
            variant="secondary"
            :disabled="busy"
            @click="transition(status)"
          >
            {{ APPLICATION_STATUS_LABELS[status] }}
          </DsButton>
        </div>
      </DsCard>

      <DsCard title="Ярилцлага" eyebrow="1E-05">
        <div class="gks-appadm__row">
          <DsInput v-model="interview.at" type="datetime-local" label="Ярилцлагын цаг" />
          <DsInput v-model="interview.note" label="Бэлтгэлийн заавар" placeholder="Хэрэглэгчид харагдана" />
          <DsButton variant="secondary" :disabled="!interview.at || busy" @click="scheduleInterview">Товлох</DsButton>
        </div>
        <p v-if="application.interviewAt" class="gks-muted gks-tnum">
          Одоогийн товлолт: {{ formatDate(application.interviewAt) }}
        </p>
      </DsCard>

      <DsCard title="Нэмэлт материал шаардах" eyebrow="1E-04">
        <div class="gks-appadm__chips">
          <DsTag
            v-for="template in templates"
            :key="template.id"
            clickable
            :selected="extraDocs.templateIds.includes(template.id)"
            @click="extraDocs.templateIds.includes(template.id)
              ? extraDocs.templateIds.splice(extraDocs.templateIds.indexOf(template.id), 1)
              : extraDocs.templateIds.push(template.id)"
          >
            {{ template.nameMn }}
          </DsTag>
        </div>
        <div class="gks-appadm__row">
          <DsInput v-model="extraDocs.dueAt" type="date" label="Эцсийн хугацаа" />
          <DsInput v-model="extraDocs.note" label="Тайлбар" />
          <DsButton variant="secondary" :disabled="!extraDocs.templateIds.length || busy" @click="requestDocs">
            Чеклистэд нэмэх
          </DsButton>
        </div>
      </DsCard>

      <DsCard title="Хариу бүртгэх" :eyebrow="isGks ? 'GKS — хоёр шаттай' : 'Нэг удаагийн хариу'">
        <div class="gks-appadm__row">
          <DsSelect
            v-if="isGks"
            v-model="result.round"
            label="Шат"
            :options="[{ value: '1', label: '1-р шат' }, { value: '2', label: '2-р шат' }]"
          />
          <DsSelect v-model="result.decision" label="Шийдвэр" :options="DECISION_OPTIONS" />
          <DsInput v-model="result.note" label="Тэмдэглэл" />
          <DsButton variant="accent" :disabled="busy" @click="recordResult">Бүртгэх</DsButton>
        </div>
        <ul v-if="application.results.length" class="gks-appadm__results">
          <li v-for="row in application.results" :key="row.id">
            {{ row.round }}-р шат · {{ APPLICATION_DECISION_LABELS[row.decision] }} · <span class="gks-tnum">{{ formatDate(row.decidedAt) }}</span>
          </li>
        </ul>
      </DsCard>

      <DsCard title="Сургуулийн төлбөрийн нэхэмжлэх" :eyebrow="`Өнөөдрийн ханш ${fx?.rate ?? '—'}₮`">
        <div v-for="(item, index) in invoiceForm.items" :key="index" class="gks-appadm__row">
          <DsSelect v-model="item.kind" :options="KIND_OPTIONS" label="Төрөл" />
          <DsInput v-model="item.labelMn" label="Тайлбар" />
          <DsInput v-model="item.amountKrw" label="Дүн (₩)" type="number" inputmode="numeric" />
        </div>
        <DsButton size="sm" variant="ghost" icon-left="plus" @click="addInvoiceLine">Мөр нэмэх</DsButton>

        <div class="gks-appadm__row">
          <DsInput v-model="invoiceForm.fxRate" label="Ханш (₮/₩)" type="number" step="0.0001" />
          <DsInput v-model="invoiceForm.transferFeeMnt" label="Шилжүүлгийн шимтгэл (₮)" type="number" inputmode="numeric" />
          <DsInput v-model="invoiceForm.dueAt" type="date" label="Эцсийн хугацаа" />
        </div>
        <p class="gks-appadm__total gks-tnum">
          {{ formatKrwAmount(invoiceTotalKrw) }} ≈ {{ formatMntAmount(invoiceTotalMnt) }}
        </p>
        <DsButton variant="accent" :disabled="invoiceTotalKrw <= 0 || busy" @click="createInvoice">Нэхэмжлэх үүсгэх</DsButton>

        <ul v-if="invoices.length" class="gks-appadm__invoices">
          <li v-for="invoice in invoices" :key="invoice.id">
            <div>
              <p class="gks-tnum">{{ formatKrwAmount(invoice.totalKrw) }} · {{ formatMntAmount(invoice.amountMnt) }}</p>
              <p class="gks-muted gks-tnum">{{ formatDate(invoice.createdAt) }} · ханш {{ Number(invoice.fxRate) }}₮</p>
            </div>
            <div class="gks-appadm__invoice-actions">
              <DsBadge :tone="invoice.status === 'CONFIRMED_BY_SCHOOL' ? 'success' : invoice.status === 'PAID' ? 'info' : 'neutral'">
                {{ SCHOOL_INVOICE_STATUS_LABELS[invoice.status] }}
              </DsBadge>
              <DsButton v-if="invoice.status === 'ISSUED'" size="sm" variant="secondary" @click="markInvoicePaid(invoice.id)">Төлсөн</DsButton>
              <DsButton v-if="invoice.status === 'PAID'" size="sm" variant="secondary" @click="markInvoiceConfirmed(invoice.id)">Сургууль хүлээн авсан</DsButton>
            </div>
          </li>
        </ul>
      </DsCard>

      <DsCard title="Урилга бүртгэх" eyebrow="Визний шат нээгдэнэ">
        <div class="gks-appadm__row">
          <DsInput v-model="invitationForm.number" label="Урилгын дугаар" />
          <DsInput v-model="invitationForm.issuedAt" type="date" label="Олгосон огноо" />
          <DsInput v-model="invitationForm.note" label="Тэмдэглэл" />
        </div>
        <input type="file" accept=".pdf,.jpg,.png" class="gks-appadm__file" @change="invitationFile = ($event.target as HTMLInputElement).files?.[0] ?? null">
        <DsButton variant="accent" :disabled="busy" @click="recordInvitation">
          {{ invitation ? 'Урилга шинэчлэх' : 'Урилга бүртгэх' }}
        </DsButton>
        <p v-if="invitation" class="gks-muted gks-tnum">
          Бүртгэсэн: {{ formatDate(invitation.issuedAt ?? invitation.receivedAt) }}
        </p>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-page__back { align-self: flex-start; }
.gks-appadm__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-muted { font-size: var(--fs-caption); }

.gks-appadm__gate { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); padding: var(--sp-3); border-radius: var(--radius-2); background: var(--warning-bg); border: var(--border-hair) solid var(--warning-line); color: var(--warning-fg); font-size: var(--fs-body-sm); }
.gks-appadm__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-appadm__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); align-items: end; margin-bottom: var(--sp-3); }
.gks-appadm__chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-4); max-height: 160px; overflow-y: auto; }
.gks-appadm__results { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-appadm__total { margin: var(--sp-3) 0; font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-appadm__invoices { margin-top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-appadm__invoices li { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); padding-top: var(--sp-3); border-top: var(--border-hair) solid var(--line-hairline); font-size: var(--fs-body-sm); }
.gks-appadm__invoice-actions { display: flex; align-items: center; gap: var(--sp-2); }
.gks-appadm__file { display: block; margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); }
</style>
