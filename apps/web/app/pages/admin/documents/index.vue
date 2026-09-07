<script setup lang="ts">
import type { CaseDocument, DocStage, DocumentStatus, PaginatedResult, ReviewQueueItem, SignedFile } from '@gks/shared';

/**
 * 1D-16 — the review workspace. A queue on the left (oldest submission first,
 * so nobody waits), the picked document expanded on the right with the same
 * card the client sees, plus the deadlines worth chasing today (1D-12).
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });

type Paginated = PaginatedResult<ReviewQueueItem>;

const STAGE_OPTIONS = selectOptions(DOC_STAGE_LABELS, 'Бүх шат');
const STATUS_OPTIONS = selectOptions(DOCUMENT_STATUS_LABELS, 'Шалгах дараалал');

const api = useApi();
const config = useRuntimeConfig();
const route = useRoute();

// Arriving from a case detail page pre-filters the queue to that case (1D-19 link).
const caseId = ref(typeof route.query.caseId === 'string' ? route.query.caseId : '');
const q = ref('');
const stage = ref<DocStage | ''>('');
const status = ref<DocumentStatus | ''>('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const upcoming = ref<ReviewQueueItem[]>([]);
const selectedId = ref<string | null>(null);
const selected = ref<CaseDocument | null>(null);
const pending = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(caseId.value ? { caseId: caseId.value } : {}),
}));

async function load() {
  pending.value = true;
  error.value = null;
  try {
    const [list, due] = await Promise.all([
      api.get<Paginated>('/case-documents', { query: query.value }),
      api.get<ReviewQueueItem[]>('/case-documents/reminders'),
    ]);
    data.value = list;
    upcoming.value = due;
    if (!selectedId.value && list.items[0]) await select(list.items[0].id);
  } catch (e) {
    error.value = apiErrorMessage(e, 'Дарааллыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

async function select(id: string) {
  selectedId.value = id;
  selected.value = await api.get<CaseDocument>(`/case-documents/${id}`);
}

async function refreshSelected() {
  if (selectedId.value) selected.value = await api.get<CaseDocument>(`/case-documents/${selectedId.value}`);
  const list = await api.get<Paginated>('/case-documents', { query: query.value });
  data.value = list;
}

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await refreshSelected();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = false;
  }
}

function onReview(action: 'ACCEPT' | 'REQUEST_FIX' | 'RETURN', note: string) {
  return act(() => api.post(`/case-documents/${selectedId.value}/review`, { action, note: note || undefined }));
}
function onTransition(toStatus: DocumentStatus) {
  return act(() => api.post(`/case-documents/${selectedId.value}/transitions`, { toStatus }));
}
function onSend(payload: { files: File[]; note: string }) {
  return act(async () => {
    if (payload.files.length) {
      const body = new FormData();
      for (const file of payload.files) body.append('files', file);
      await api.post(`/case-documents/${selectedId.value}/files?isFinal=true`, body);
    }
    if (payload.note) await api.post(`/case-documents/${selectedId.value}/notes`, { body: payload.note });
  });
}
async function openFile(fileId: string) {
  const signed = await api.get<SignedFile>(`/document-files/${fileId}/url`);
  window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
}

watch([stage, status], () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 350); });
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

function waitedFor(value: string | null): string {
  if (!value) return '—';
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000);
  if (hours < 1) return 'дөнгөж сая';
  if (hours < 24) return `${hours} цаг`;
  return `${Math.floor(hours / 24)} хоног`;
}

useHead({ title: 'Материал шалгах · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Материал шалгах</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} материал дараалалд</p>
      </div>
    </header>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Үйлчилгээний код, хэрэглэгчээр хайх…  ( / )"
        />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Шат" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
      </div>
    </DsCard>

    <p v-if="caseId" class="gks-review__scope">
      Нэг үйлчилгээгээр шүүсэн байна.
      <button type="button" class="gks-review__clear" @click="caseId = ''; page = 1; load()">Бүх үйлчилгээг харах</button>
    </p>
    <p v-if="error" class="gks-review__error">{{ error }}</p>

    <div class="gks-split">
      <aside class="gks-split__list gks-queue-list">
        <div v-if="pending && !data" class="gks-skeleton gks-skeleton--tall">
          <div v-for="n in 5" :key="n" class="gks-skeleton__row" />
        </div>
        <p v-else-if="!data?.items.length" class="gks-empty">Шалгах материал алга байна.</p>

        <button
          v-for="item in data?.items ?? []"
          :key="item.id"
          type="button"
          class="gks-queue-item"
          :class="{ 'gks-queue-item--active': item.id === selectedId }"
          @click="select(item.id)"
        >
          <span class="gks-queue-item__name">{{ item.template.nameMn }}</span>
          <span class="gks-queue-item__sub gks-tnum">{{ item.case.code }} · {{ item.case.user.name ?? item.case.user.email }}</span>
          <span class="gks-queue-item__meta">
            <DsBadge :tone="DOCUMENT_STATUS_TONE[item.status]">{{ DOCUMENT_STATUS_LABELS[item.status] }}</DsBadge>
            <span class="gks-review__waited">{{ waitedFor(item.submittedAt) }}</span>
          </span>
        </button>

        <DsPager v-model:page="page" :total-pages="totalPages" />
      </aside>

      <section class="gks-review__detail">
        <DocumentsDocumentCard
          v-if="selected"
          :key="selected.id"
          :document="selected"
          mode="staff"
          :busy="busy"
          @review="onReview"
          @transition="onTransition"
          @send="onSend"
          @open="openFile"
        />
        <DsCard v-else padding="var(--sp-8)"><p class="gks-empty">Зүүн талаас материал сонгоно уу.</p></DsCard>

        <DsCard v-if="upcoming.length" title="Хугацаа дөхсөн" eyebrow="Дараагийн 7 хоног">
          <ul class="gks-review__due">
            <li v-for="item in upcoming.slice(0, 10)" :key="item.id">
              <NuxtLink :to="`/admin/cases/${item.case.id}`" class="gks-review__due-link">{{ item.case.code }}</NuxtLink>
              <span>{{ item.template.nameMn }}</span>
              <span class="gks-review__due-date gks-tnum">
                {{ formatDayMonth(item.dueAt) }}
              </span>
            </li>
          </ul>
        </DsCard>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gks-review__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-review__scope { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-review__clear { border: 0; background: none; padding: 0; font: inherit; color: var(--brand-700); text-decoration: underline; cursor: pointer; }
.gks-review__waited { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-review__detail { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-review__due { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-review__due li { display: grid; grid-template-columns: minmax(140px, auto) 1fr auto; gap: var(--sp-3); align-items: baseline; }
.gks-review__due-link { color: var(--brand-700); text-decoration: none; }
.gks-review__due-date { color: var(--text-subtle); font-size: var(--fs-caption); }
</style>

