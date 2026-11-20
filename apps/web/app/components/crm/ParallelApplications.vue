<script setup lang="ts">
import type { Application, ApplicationDecision, ApplicationStatus, ParallelApplicationCandidate, ServiceType } from '@gks/shared';

/**
 * 1E-13 — the other schools the case's materials went to, beside the primary
 * application. Each is moved, booked and decided on its own row; none of it
 * moves the case, which follows the primary alone. The school list itself is
 * edited on the client page — a school appears here once it is a choice.
 */
const props = defineProps<{
  caseId: string;
  /** Unknown while the primary application has not been opened. */
  serviceType?: ServiceType;
  parallel: Application[];
  candidates: ParallelApplicationCandidate[];
}>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();
const busy = ref(false);
const error = ref<string | null>(null);

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    emit('changed');
  } catch (e) {
    error.value = apiErrorMessage(e, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = false;
  }
}

/** Only the moves the API will accept (1E-02); the decision has its own form. */
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
const DECIDABLE: ApplicationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_DOCS_REQUESTED', 'INTERVIEW_SCHEDULED', 'DEFERRED'];
const REMOVABLE: ApplicationStatus[] = ['PREPARING', 'READY'];
/** An interview is booked once the school has the file (1E-05). */
const INTERVIEWABLE: ApplicationStatus[] = ['UNDER_REVIEW', 'INTERVIEW_SCHEDULED'];
const DECISION_OPTIONS = selectOptions(APPLICATION_DECISION_LABELS);

/** Per-row form state, keyed by application id. */
const forms = reactive<Record<string, { applicationNo: string; interviewAt: string; decision: ApplicationDecision; note: string }>>({});
watch(
  () => props.parallel,
  (rows) => {
    for (const row of rows) {
      forms[row.id] ??= { applicationNo: row.applicationNo ?? '', interviewAt: '', decision: 'PASSED', note: '' };
    }
  },
  { immediate: true },
);

/** The id whose remove button has been pressed once — the second press removes. */
const confirmingRemove = ref<string | null>(null);

function open(candidate: ParallelApplicationCandidate) {
  return act(() => api.post(`/cases/${props.caseId}/applications`, { universityId: candidate.universityId }));
}
function transition(row: Application, toStatus: ApplicationStatus) {
  return act(() => api.post(`/applications/${row.id}/transitions`, { toStatus }));
}
function saveNumber(row: Application) {
  return act(() => api.patch(`/applications/${row.id}`, { applicationNo: forms[row.id]!.applicationNo.trim() }));
}
function scheduleInterview(row: Application) {
  return act(() =>
    api.post(`/applications/${row.id}/interview`, { interviewAt: new Date(forms[row.id]!.interviewAt).toISOString() }),
  );
}
function recordResult(row: Application) {
  const form = forms[row.id]!;
  return act(() => api.post(`/applications/${row.id}/results`, { decision: form.decision, note: form.note || undefined }));
}
function remove(row: Application) {
  if (confirmingRemove.value !== row.id) {
    confirmingRemove.value = row.id;
    return;
  }
  confirmingRemove.value = null;
  return act(() => api.delete(`/applications/${row.id}`));
}

const eyebrow = computed(() =>
  props.serviceType === 'GKS_SCHOLARSHIP' ? 'GKS-ээс гадна — энгийн зуучлал' : 'Зэрэгцээ мэдүүлэг',
);
</script>

<template>
  <DsCard title="Нэмэлт сургуулийн мэдүүлэг" :eyebrow="eyebrow">
    <p v-if="error" class="gks-parallel__error">{{ error }}</p>

    <p v-if="!parallel.length && !candidates.length" class="gks-parallel__empty">
      Нэмэлт сургууль сонгоогүй байна. Үйлчлүүлэгчийн хуудаснаас сургуулийн сонголтод нэмбэл энд гарч ирнэ.
    </p>

    <ul v-if="parallel.length" class="gks-parallel__list">
      <li v-for="row in parallel" :key="row.id" class="gks-parallel__item">
        <header class="gks-parallel__head">
          <div>
            <p class="gks-parallel__school">{{ universityName(row.university, UNKNOWN_LABEL) }}</p>
            <p class="gks-parallel__meta gks-tnum">
              {{ row.program?.nameMn ?? 'Хөтөлбөр сонгоогүй' }}
              <template v-if="row.submittedAt"> · илгээсэн {{ formatDate(row.submittedAt) }}</template>
              <template v-if="row.interviewAt"> · ярилцлага {{ formatDate(row.interviewAt) }}</template>
              <template v-if="row.decidedAt"> · хариу {{ formatDate(row.decidedAt) }}</template>
            </p>
          </div>
          <DsBadge :tone="APPLICATION_STATUS_TONE[row.status]">{{ APPLICATION_STATUS_LABELS[row.status] }}</DsBadge>
        </header>

        <div class="gks-parallel__actions">
          <DsButton
            v-for="status in NEXT_STATUSES[row.status]"
            :key="status"
            size="sm"
            variant="secondary"
            :disabled="busy"
            @click="transition(row, status)"
          >
            {{ APPLICATION_STATUS_LABELS[status] }}
          </DsButton>
          <DsButton
            v-if="REMOVABLE.includes(row.status)"
            size="sm"
            variant="ghost"
            icon-left="trash-2"
            :disabled="busy"
            @click="remove(row)"
          >
            {{ confirmingRemove === row.id ? 'Устгахыг батлах' : 'Устгах' }}
          </DsButton>
        </div>

        <div v-if="forms[row.id]" class="gks-parallel__row">
          <DsInput v-model="forms[row.id]!.applicationNo" label="Сургуулийн бүртгэлийн дугаар" />
          <DsButton
            size="sm"
            variant="secondary"
            :disabled="busy || forms[row.id]!.applicationNo.trim() === (row.applicationNo ?? '')"
            @click="saveNumber(row)"
          >
            Хадгалах
          </DsButton>
        </div>

        <div v-if="forms[row.id] && INTERVIEWABLE.includes(row.status)" class="gks-parallel__row">
          <DsInput v-model="forms[row.id]!.interviewAt" type="datetime-local" label="Ярилцлагын цаг" />
          <DsButton size="sm" variant="secondary" :disabled="busy || !forms[row.id]!.interviewAt" @click="scheduleInterview(row)">
            Товлох
          </DsButton>
        </div>

        <div v-if="forms[row.id] && (DECIDABLE.includes(row.status) || row.results.length)" class="gks-parallel__row">
          <DsSelect v-model="forms[row.id]!.decision" label="Сургуулийн хариу" :options="DECISION_OPTIONS" />
          <DsInput v-model="forms[row.id]!.note" label="Тэмдэглэл" />
          <DsButton size="sm" variant="accent" :disabled="busy" @click="recordResult(row)">
            {{ row.results.length ? 'Хариу засах' : 'Хариу бүртгэх' }}
          </DsButton>
        </div>
      </li>
    </ul>

    <div v-if="candidates.length" class="gks-parallel__candidates">
      <p class="gks-parallel__hint">Материал илгээх гэж буй сургуулийг мөрдөж эхлэх:</p>
      <div v-for="candidate in candidates" :key="candidate.universityId" class="gks-parallel__candidate">
        <span>{{ universityName(candidate.university, UNKNOWN_LABEL) }}<template v-if="candidate.program"> · {{ candidate.program.nameMn }}</template></span>
        <DsButton size="sm" variant="secondary" icon-left="plus" :disabled="busy" @click="open(candidate)">Мэдүүлэг нээх</DsButton>
      </div>
    </div>

    <p class="gks-parallel__footnote">
      Материал нэг л удаа бүрдэнэ — бүх сургуульд ижил жагсаалт. Эндхийн хариу үйлчилгээний шатыг хөдөлгөхгүй.
    </p>
  </DsCard>
</template>

<style scoped>
.gks-parallel__error { color: var(--danger-fg); font-size: var(--fs-body-sm); margin-bottom: var(--sp-3); }
.gks-parallel__empty, .gks-parallel__hint, .gks-parallel__footnote { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-parallel__footnote { margin-top: var(--sp-4); }
.gks-parallel__list { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-parallel__item { padding: var(--sp-4); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-2); }
.gks-parallel__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); }
.gks-parallel__school { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-parallel__meta { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-parallel__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-3) 0; }
.gks-parallel__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); align-items: end; margin-top: var(--sp-3); }
.gks-parallel__candidates { margin-top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-parallel__candidate { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); font-size: var(--fs-body-sm); }
</style>
