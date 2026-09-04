<script setup lang="ts">
import type { CaseDocument, DocStage, DocumentChecklist, DocumentStatus, SignedFile, WorkspaceCase } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * Documents tab (1G-17) — this client's checklist, in place.
 *
 * It reuses `DocumentsDocumentCard` in `staff` mode, the same card the review
 * queue at `/admin/documents` renders, so accept/return/translate behave
 * identically here; only the way in is different.
 */
const props = defineProps<{ workspaceCase: WorkspaceCase }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();
const config = useRuntimeConfig();

const stage = ref<DocStage>('ADMISSION');
const checklist = ref<DocumentChecklist | null>(null);
const pending = ref(true);
const busy = ref(false);
const errorMsg = ref<string | null>(null);

const caseId = computed(() => props.workspaceCase.id);

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    checklist.value = await api.get<DocumentChecklist>(`/cases/${caseId.value}/documents`, {
      query: { stage: stage.value },
    });
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Материалыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);
watch([stage, caseId], load);

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  errorMsg.value = null;
  try {
    await action();
    await load();
    emit('changed');
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

function onReview(documentId: string, action: 'ACCEPT' | 'REQUEST_FIX' | 'RETURN', note: string) {
  return act(() => api.post(`/case-documents/${documentId}/review`, { action, note: note || undefined }));
}
function onTransition(documentId: string, toStatus: DocumentStatus) {
  return act(() => api.post(`/case-documents/${documentId}/transitions`, { toStatus }));
}
function onNote(documentId: string, body: string) {
  return act(() => api.post(`/case-documents/${documentId}/notes`, { body }));
}
function onUpload(documentId: string, files: File[]) {
  const body = new FormData();
  for (const file of files) body.append('files', file);
  return act(() => api.post(`/case-documents/${documentId}/files?isFinal=true`, body));
}
async function openFile(fileId: string) {
  const signed = await api.get<SignedFile>(`/document-files/${fileId}/url`);
  window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
}

/** Re-resolves the requirement rules after the questionnaire or a school request. */
function resolveChecklist() {
  return act(() => api.post(`/cases/${caseId.value}/documents/resolve`, undefined, { query: { stage: stage.value } }));
}

const documents = computed<CaseDocument[]>(() => checklist.value?.documents ?? []);
const progress = computed(() => checklist.value?.progress ?? null);

/** Outstanding first — the reason someone opened this tab. */
const ordered = computed(() => {
  const rank: Partial<Record<DocumentStatus, number>> = {
    NEEDS_FIX: 0,
    RESUBMIT_REQUIRED: 0,
    SUBMITTED: 1,
    UNDER_REVIEW: 1,
    NOT_STARTED: 2,
    IN_PROGRESS: 2,
  };
  return [...documents.value].sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || a.sortOrder - b.sortOrder);
});

const hasVisaStage = computed(() => props.workspaceCase.documents.visa.requiredTotal > 0);
</script>

<template>
  <div class="gks-cdocs">
    <DsCard v-if="errorMsg" accent><p class="gks-cdocs__error">{{ errorMsg }}</p></DsCard>

    <DsCard>
      <div class="gks-cdocs__head">
        <div class="gks-cdocs__stages">
          <DsTag clickable :selected="stage === 'ADMISSION'" @click="stage = 'ADMISSION'">Элсэлтийн материал</DsTag>
          <DsTag v-if="hasVisaStage" clickable :selected="stage === 'VISA'" @click="stage = 'VISA'">Визний материал</DsTag>
        </div>
        <div class="gks-cdocs__head-actions">
          <DsButton size="sm" variant="ghost" icon-left="refresh-cw" :loading="busy" @click="resolveChecklist">
            Жагсаалт шинэчлэх
          </DsButton>
          <NuxtLink :to="`/admin/documents?caseId=${workspaceCase.id}`" class="gks-cdocs__link">
            Шалгах дараалалд →
          </NuxtLink>
        </div>
      </div>

      <DocumentsProgressBar
        v-if="progress"
        :progress="progress"
        :label="stage === 'ADMISSION' ? 'Элсэлтийн материал' : 'Визний материал'"
      />
    </DsCard>

    <div v-if="pending && !checklist" class="gks-cdocs__skeleton" />

    <DsCard v-else-if="!ordered.length" padding="var(--sp-8)">
      <p class="gks-cdocs__muted">
        Энэ шатанд материалын жагсаалт үүсээгүй байна — нөхцөлийн асуумжийг бөглөсний дараа үүснэ.
      </p>
    </DsCard>

    <ul v-else class="gks-cdocs__list">
      <li v-for="document in ordered" :key="document.id">
        <DocumentsDocumentCard
          :document="document"
          mode="staff"
          :busy="busy"
          @review="(action, note) => onReview(document.id, action, note)"
          @transition="(status) => onTransition(document.id, status)"
          @note="(body) => onNote(document.id, body)"
          @upload="(files) => onUpload(document.id, files)"
          @open="openFile"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.gks-cdocs { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-cdocs__error { color: var(--danger-fg); }
.gks-cdocs__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-4); }
.gks-cdocs__stages { display: flex; gap: var(--sp-2); }
.gks-cdocs__head-actions { display: flex; align-items: center; gap: var(--sp-3); }
.gks-cdocs__link { font-size: var(--fs-caption); color: var(--brand-700); text-decoration: none; }
.gks-cdocs__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-cdocs__muted { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-cdocs__skeleton { height: 260px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
</style>
