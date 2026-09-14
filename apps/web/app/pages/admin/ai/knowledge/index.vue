<script setup lang="ts">
import type {
  AccessLevel,
  KnowledgeCategory,
  KnowledgeDocumentListItem,
  KnowledgeKind,
  KnowledgeStatus,
  PaginatedResult,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * 2E-01 — the knowledge base the AI assistant answers from.
 *
 * The list is built around the two questions staff have when they open it: *is
 * this document actually indexed*, and *who can see it*. So the index state is a
 * column rather than a detail — chunk count, the date it was indexed, the error
 * in red if the last run failed — and so is the access level, next to a "test the
 * search" box that shows what a visitor would get back.
 *
 * Anything carrying a price, a deadline or an exchange rate belongs in the
 * admin screens that own those numbers, not here; the note above the upload
 * form says so, because a figure typed into a handbook is a second truth nobody
 * updates.
 *
 * Consultants read; admins write. The API enforces both — this page only hides
 * the controls a consultant cannot use.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'AI мэдлэгийн сан' });

const api = useApi();
const auth = useAuthStore();
const canWrite = computed(() => auth.isAdmin);

const KIND_OPTIONS = (['FILE', 'ENTRY', 'PLAYBOOK', 'FAQ', 'POST'] as KnowledgeKind[]).map((kind) => ({
  value: kind,
  label: KNOWLEDGE_KIND_LABELS[kind],
}));

const CATEGORY_OPTIONS = (
  [
    'SCHOOL',
    'SERVICE',
    'PRICING',
    'SCHOLARSHIP',
    'DOCUMENTS',
    'VISA',
    'LIVING',
    'POLICY',
    'SALES',
    'FAQ',
  ] as KnowledgeCategory[]
).map((category) => ({ value: category, label: KNOWLEDGE_CATEGORY_LABELS[category] }));

const LEVEL_OPTIONS = (['PUBLIC', 'REGISTERED', 'CONTRACTED', 'INTERNAL'] as AccessLevel[])
  .filter((level) => level !== 'INTERNAL' || canWrite.value)
  .map((level) => ({ value: level, label: ACCESS_LEVEL_LABELS[level] }));

const STATUS_OPTIONS = (['DRAFT', 'PUBLISHED', 'ARCHIVED'] as KnowledgeStatus[]).map((status) => ({
  value: status,
  label: KNOWLEDGE_STATUS_LABELS[status],
}));

// ── Filters ────────────────────────────────────────────────────────────────

const filters = reactive({
  search: '',
  kind: '' as KnowledgeKind | '',
  category: '' as KnowledgeCategory | '',
  accessLevel: '' as AccessLevel | '',
  status: '' as KnowledgeStatus | '',
  failedOnly: false,
  staleOnly: false,
});
const page = ref(1);

const rows = ref<KnowledgeDocumentListItem[]>([]);
const total = ref(0);
const totalPages = ref(1);
const loading = ref(false);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);

function fail(error: unknown, fallback: string) {
  notice.value = null;
  errorMsg.value = apiErrorMessage(error, fallback);
}

function query(): string {
  const params = new URLSearchParams({ page: String(page.value), limit: '20' });
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.category) params.set('category', filters.category);
  if (filters.accessLevel) params.set('accessLevel', filters.accessLevel);
  if (filters.status) params.set('status', filters.status);
  if (filters.failedOnly) params.set('failedOnly', 'true');
  if (filters.staleOnly) params.set('staleOnly', 'true');
  return params.toString();
}

async function load() {
  loading.value = true;
  errorMsg.value = null;
  try {
    const result = await api.get<PaginatedResult<KnowledgeDocumentListItem>>(
      `/admin/ai/knowledge?${query()}`,
    );
    rows.value = result.items;
    total.value = result.meta.total;
    totalPages.value = result.meta.totalPages;
  } catch (error) {
    fail(error, 'Мэдлэгийн сангийн жагсаалтыг ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
}

watch(filters, () => {
  page.value = 1;
  void load();
});
watch(page, () => void load());

// ── Index state, as the table reads it ─────────────────────────────────────

const notIndexed = computed(() => rows.value.filter((row) => !row.indexedAt && !row.indexError).length);
const failed = computed(() => rows.value.filter((row) => row.indexError).length);

function isStale(row: KnowledgeDocumentListItem): boolean {
  return Boolean(row.validUntil && new Date(row.validUntil).getTime() < Date.now());
}

function indexTone(row: KnowledgeDocumentListItem): 'success' | 'danger' | 'warning' {
  if (row.indexError) return 'danger';
  return row.indexedAt ? 'success' : 'warning';
}

function indexLabel(row: KnowledgeDocumentListItem): string {
  if (row.indexError) return 'Алдаа';
  if (!row.indexedAt) return 'Индексжээгүй';
  return `${row.chunkCount} chunk`;
}

// ── Writing ────────────────────────────────────────────────────────────────

const upload = reactive({
  open: false,
  file: null as File | null,
  title: '',
  category: 'DOCUMENTS' as KnowledgeCategory,
  accessLevel: 'PUBLIC' as AccessLevel,
  status: 'PUBLISHED' as KnowledgeStatus,
  validUntil: '',
  saving: false,
});

async function submitUpload() {
  if (!upload.file) {
    fail(null, 'Файл хавсаргана уу');
    return;
  }

  upload.saving = true;
  errorMsg.value = null;
  try {
    const body = new FormData();
    body.append('file', upload.file);
    body.append('title', upload.title.trim() || upload.file.name.replace(/\.[^.]+$/, ''));
    body.append('category', upload.category);
    body.append('accessLevel', upload.accessLevel);
    body.append('status', upload.status);
    if (upload.validUntil) body.append('validUntil', new Date(upload.validUntil).toISOString());

    await api.post('/admin/ai/knowledge/upload', body);
    notice.value = 'Файл хадгалагдаж, индексжүүлэх дараалалд орлоо.';
    Object.assign(upload, { open: false, file: null, title: '', validUntil: '' });
    await load();
  } catch (error) {
    fail(error, 'Файлыг байршуулж чадсангүй');
  } finally {
    upload.saving = false;
  }
}

const card = reactive({
  open: false,
  kind: 'ENTRY' as Extract<KnowledgeKind, 'ENTRY' | 'PLAYBOOK'>,
  title: '',
  question: '',
  body: '',
  category: 'FAQ' as KnowledgeCategory,
  accessLevel: 'PUBLIC' as AccessLevel,
  status: 'PUBLISHED' as KnowledgeStatus,
  saving: false,
});

async function submitCard() {
  card.saving = true;
  errorMsg.value = null;
  try {
    await api.post('/admin/ai/knowledge', {
      kind: card.kind,
      title: card.title.trim(),
      question: card.kind === 'ENTRY' ? card.question.trim() : undefined,
      body: card.body.trim(),
      category: card.category,
      // A playbook is internal whatever this form sends; the API decides.
      accessLevel: card.kind === 'PLAYBOOK' ? 'INTERNAL' : card.accessLevel,
      status: card.status,
    });
    notice.value = card.kind === 'ENTRY' ? 'Хариултын карт хадгалагдлаа.' : 'Заавар хадгалагдлаа.';
    Object.assign(card, { open: false, title: '', question: '', body: '' });
    await load();
  } catch (error) {
    fail(error, 'Хадгалж чадсангүй');
  } finally {
    card.saving = false;
  }
}

async function reindex(row: KnowledgeDocumentListItem) {
  errorMsg.value = null;
  try {
    await api.post(`/admin/ai/knowledge/${row.id}/reindex`, {});
    notice.value = `«${row.title}» дахин индексжүүлэх дараалалд орлоо.`;
    await load();
  } catch (error) {
    fail(error, 'Дахин индексжүүлж чадсангүй');
  }
}

async function reindexPending() {
  errorMsg.value = null;
  try {
    const { queued } = await api.post<{ queued: number }>('/admin/ai/knowledge/reindex-pending', {});
    notice.value = queued
      ? `${queued} баримт индексжүүлэх дараалалд орлоо.`
      : 'Индексжээгүй баримт байхгүй.';
    await load();
  } catch (error) {
    fail(error, 'Дарааллыг үүсгэж чадсангүй');
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Үе шат 2 · 2A</span>
        <h1 class="gks-page__title">AI мэдлэгийн сан</h1>
        <p class="gks-page__hint">
          Туслах зөвхөн эндээс зөвлөгөө, журам, тайлбар уншина. Үнэ, элсэлтийн хугацаа, сургалтын
          төлбөр, ханш нь өөрийн дэлгэцтэй — тэднийг баримт дотор бичвэл хоёр үнэн үүснэ.
        </p>
      </div>

      <div v-if="canWrite" class="gks-page__actions">
        <DsButton variant="secondary" icon-left="refresh-cw" @click="reindexPending">
          Индексжээгүйг дараалалд
        </DsButton>
        <DsButton variant="secondary" icon-left="message-square-quote" @click="card.open = !card.open">
          Карт / заавар
        </DsButton>
        <DsButton variant="accent" icon-left="upload" @click="upload.open = !upload.open">
          Файл нэмэх
        </DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-ai-kb__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-ai-kb__notice">{{ notice }}</p>

    <DsCard v-if="canWrite && upload.open" title="Файлаас баримт нэмэх">
      <form class="gks-form-grid" @submit.prevent="submitUpload">
        <DsFileField
          v-model="upload.file"
          label="Файл"
          accept=".docx,.pdf,.md,.txt"
          hint="DOCX, PDF, MD, TXT — гарчгийн стильтэй DOCX эсвэл Markdown бол хамгийн сайн индексжинэ"
          class="gks-form-grid__full"
        />
        <DsInput v-model="upload.title" label="Гарчиг" hint="Хоосон бол файлын нэрээр" />
        <DsSelect v-model="upload.category" label="Ангилал" :options="CATEGORY_OPTIONS" />
        <DsSelect v-model="upload.accessLevel" label="Хэн харах" :options="LEVEL_OPTIONS" />
        <DsSelect v-model="upload.status" label="Төлөв" :options="STATUS_OPTIONS" />
        <DsInput
          v-model="upload.validUntil"
          type="date"
          label="Хүчинтэй хугацаа"
          hint="Огноотой мэдээлэлд тавь — дараа нь хайлтаас өөрөө унана"
        />
        <div class="gks-ai-kb__form-actions">
          <DsButton type="submit" variant="accent" :disabled="upload.saving">
            {{ upload.saving ? 'Байршуулж байна…' : 'Байршуулах' }}
          </DsButton>
          <DsButton variant="secondary" @click="upload.open = false">Болих</DsButton>
        </div>
      </form>
    </DsCard>

    <DsCard v-if="canWrite && card.open" title="Хариултын карт / борлуулалтын заавар">
      <form class="gks-form-grid" @submit.prevent="submitCard">
        <DsSelect
          v-model="card.kind"
          label="Төрөл"
          :options="[
            { value: 'ENTRY', label: 'Хариултын карт — нэг асуулт, нэг баталгаат хариулт' },
            { value: 'PLAYBOOK', label: 'Борлуулалтын заавар — зан төлөв, хэрэглэгчид гарахгүй' },
          ]"
          class="gks-form-grid__full"
        />
        <DsInput v-model="card.title" label="Гарчиг" required />
        <DsSelect v-model="card.category" label="Ангилал" :options="CATEGORY_OPTIONS" />
        <DsInput
          v-if="card.kind === 'ENTRY'"
          v-model="card.question"
          label="Асуулт"
          hint="Хэрэглэгч хэрхэн асуудаг байдлаар бич — карт асуултаараа хайгддаг"
          class="gks-form-grid__full"
          required
        />
        <DsSelect
          v-if="card.kind === 'ENTRY'"
          v-model="card.accessLevel"
          label="Хэн харах"
          :options="LEVEL_OPTIONS"
        />
        <DsSelect v-model="card.status" label="Төлөв" :options="STATUS_OPTIONS" />
        <DsTextarea
          v-model="card.body"
          :label="card.kind === 'ENTRY' ? 'Баталгаат хариулт' : 'Заавар'"
          :rows="8"
          class="gks-form-grid__full"
          required
        />
        <p v-if="card.kind === 'PLAYBOOK'" class="gks-ai-kb__hint gks-form-grid__full">
          Заавар үргэлж дотоод. Туслахын зан төлөвт нөлөөлнө, хариултад хэзээ ч ишлэгдэхгүй.
        </p>
        <div class="gks-ai-kb__form-actions">
          <DsButton type="submit" variant="accent" :disabled="card.saving">
            {{ card.saving ? 'Хадгалж байна…' : 'Хадгалах' }}
          </DsButton>
          <DsButton variant="secondary" @click="card.open = false">Болих</DsButton>
        </div>
      </form>
    </DsCard>

    <AdminAiSearchTest :can-probe-internal="canWrite" />

    <DsCard title="Баримтууд">
      <div class="gks-ai-kb__filters">
        <DsInput v-model="filters.search" label="Хайх" placeholder="Гарчиг, асуулт, бичвэр" />
        <DsSelect v-model="filters.kind" label="Төрөл" :options="[{ value: '', label: 'Бүгд' }, ...KIND_OPTIONS]" />
        <DsSelect
          v-model="filters.category"
          label="Ангилал"
          :options="[{ value: '', label: 'Бүгд' }, ...CATEGORY_OPTIONS]"
        />
        <DsSelect
          v-model="filters.accessLevel"
          label="Хэн харах"
          :options="[{ value: '', label: 'Бүгд' }, ...LEVEL_OPTIONS]"
        />
        <DsSelect
          v-model="filters.status"
          label="Төлөв"
          :options="[{ value: '', label: 'Бүгд' }, ...STATUS_OPTIONS]"
        />
        <div class="gks-ai-kb__toggles">
          <DsCheckbox v-model="filters.failedOnly" label="Зөвхөн алдаатай" />
          <DsCheckbox v-model="filters.staleOnly" label="Зөвхөн хугацаа дууссан" />
        </div>
      </div>

      <p class="gks-ai-kb__summary gks-tnum">
        Нийт {{ total }}
        <template v-if="notIndexed">· индексжээгүй {{ notIndexed }}</template>
        <template v-if="failed">· алдаатай {{ failed }}</template>
      </p>

      <p v-if="loading" class="gks-empty">Ачаалж байна…</p>
      <p v-else-if="!rows.length" class="gks-empty">Баримт олдсонгүй.</p>

      <table v-else class="gks-table">
        <thead>
          <tr>
            <th>Гарчиг</th>
            <th>Төрөл</th>
            <th>Ангилал</th>
            <th>Хэн харах</th>
            <th>Төлөв</th>
            <th>Индекс</th>
            <th>Индексжсэн</th>
            <th v-if="canWrite" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <NuxtLink :to="`/admin/ai/knowledge/${row.id}`" class="gks-ai-kb__title">{{ row.title }}</NuxtLink>
              <p v-if="row.question" class="gks-ai-kb__question">{{ row.question }}</p>
              <p v-if="row.university" class="gks-ai-kb__meta">{{ row.university.nameMn }}</p>
              <p v-if="row.indexError" class="gks-ai-kb__index-error">{{ row.indexError }}</p>
            </td>
            <td>{{ KNOWLEDGE_KIND_LABELS[row.kind] }}</td>
            <td>{{ KNOWLEDGE_CATEGORY_LABELS[row.category] }}</td>
            <td>
              <DsBadge :tone="row.accessLevel === 'INTERNAL' ? 'warning' : 'neutral'">
                {{ ACCESS_LEVEL_LABELS[row.accessLevel] }}
              </DsBadge>
            </td>
            <td>
              <DsBadge :tone="row.status === 'PUBLISHED' ? 'success' : 'neutral'">
                {{ KNOWLEDGE_STATUS_LABELS[row.status] }}
              </DsBadge>
              <DsBadge v-if="isStale(row)" tone="danger">Хугацаа дууссан</DsBadge>
            </td>
            <td><DsBadge :tone="indexTone(row)">{{ indexLabel(row) }}</DsBadge></td>
            <td class="gks-tnum">{{ formatNumericDate(row.indexedAt) }}</td>
            <td v-if="canWrite" class="gks-ai-kb__row-actions">
              <DsButton variant="secondary" size="sm" icon-left="refresh-cw" @click="reindex(row)">
                Дахин
              </DsButton>
            </td>
          </tr>
        </tbody>
      </table>

      <DsPager v-if="totalPages > 1" v-model:page="page" :total-pages="totalPages" />
    </DsCard>
  </div>
</template>

<style scoped>
.gks-ai-kb__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-ai-kb__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-ai-kb__hint { color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-ai-kb__form-actions {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--sp-3);
  align-items: center;
}

.gks-ai-kb__filters {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--sp-3);
  align-items: end;
}

.gks-ai-kb__toggles { display: flex; flex-direction: column; gap: var(--sp-1); }

.gks-ai-kb__summary {
  margin: var(--sp-3) 0 0;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}

.gks-ai-kb__title { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-ai-kb__question { margin: 2px 0 0; font-size: var(--fs-micro); color: var(--text-muted); }
.gks-ai-kb__meta { margin: 0; font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-ai-kb__index-error { margin: 2px 0 0; font-size: var(--fs-micro); color: var(--text-red); }
.gks-ai-kb__row-actions { white-space: nowrap; }
</style>
