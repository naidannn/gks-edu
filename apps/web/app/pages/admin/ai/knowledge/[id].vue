<script setup lang="ts">
import type {
  AccessLevel,
  KnowledgeCategory,
  KnowledgeDocumentDetail,
  KnowledgeStatus,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * One knowledge document (2E-01).
 *
 * The chunks are the point of this page. A document is not what the assistant
 * reads — its chunks are, each one carrying the heading path it was found under,
 * and seeing them is the only way to tell a well-structured handbook from a wall
 * of text that will retrieve badly. So they are listed in full, with their
 * heading trail and token count, under the metadata that decides who may see
 * them at all.
 *
 * A `FILE` document's body is not editable here: its text lives in storage and is
 * re-extracted on every ingest. Changing it means uploading the file again.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const router = useRouter();
const api = useApi();
const auth = useAuthStore();
const canWrite = computed(() => auth.isAdmin);

const id = computed(() => String(route.params.id));

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

const LEVEL_OPTIONS = (['PUBLIC', 'REGISTERED', 'CONTRACTED', 'INTERNAL'] as AccessLevel[]).map((level) => ({
  value: level,
  label: ACCESS_LEVEL_LABELS[level],
}));

const STATUS_OPTIONS = (['DRAFT', 'PUBLISHED', 'ARCHIVED'] as KnowledgeStatus[]).map((status) => ({
  value: status,
  label: KNOWLEDGE_STATUS_LABELS[status],
}));

const document = ref<KnowledgeDocumentDetail | null>(null);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const form = reactive({
  title: '',
  question: '',
  body: '',
  category: 'FAQ' as KnowledgeCategory,
  accessLevel: 'PUBLIC' as AccessLevel,
  status: 'DRAFT' as KnowledgeStatus,
  validUntil: '',
});

function fail(error: unknown, fallback: string) {
  notice.value = null;
  errorMsg.value = apiErrorMessage(error, fallback);
}

async function load() {
  errorMsg.value = null;
  try {
    const row = await api.get<KnowledgeDocumentDetail>(`/admin/ai/knowledge/${id.value}`);
    document.value = row;
    Object.assign(form, {
      title: row.title,
      question: row.question ?? '',
      body: row.body ?? '',
      category: row.category,
      accessLevel: row.accessLevel,
      status: row.status,
      validUntil: row.validUntil?.slice(0, 10) ?? '',
    });
    useHead({ title: `${row.title} · AI мэдлэгийн сан` });
  } catch (error) {
    fail(error, 'Баримтыг ачаалж чадсангүй');
  }
}

const isFile = computed(() => document.value?.kind === 'FILE');
const isMirror = computed(() => document.value?.kind === 'FAQ' || document.value?.kind === 'POST');
const isStale = computed(() =>
  Boolean(document.value?.validUntil && new Date(document.value.validUntil).getTime() < Date.now()),
);

async function save() {
  saving.value = true;
  errorMsg.value = null;
  try {
    await api.patch(`/admin/ai/knowledge/${id.value}`, {
      title: form.title.trim(),
      question: form.question.trim() || null,
      // A file's text is re-extracted from storage; sending a body would create
      // a second, silently divergent copy of it.
      ...(isFile.value ? {} : { body: form.body.trim() }),
      category: form.category,
      accessLevel: form.accessLevel,
      status: form.status,
      validUntil: form.validUntil ? new Date(form.validUntil).toISOString() : null,
    });
    notice.value = 'Хадгалагдлаа. Бичвэр өөрчлөгдсөн бол дахин индексжинэ.';
    await load();
  } catch (error) {
    fail(error, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

async function reindex() {
  errorMsg.value = null;
  try {
    await api.post(`/admin/ai/knowledge/${id.value}/reindex`, {});
    notice.value = 'Дахин индексжүүлэх дараалалд орлоо.';
    await load();
  } catch (error) {
    fail(error, 'Дахин индексжүүлж чадсангүй');
  }
}

async function remove() {
  errorMsg.value = null;
  try {
    await api.delete(`/admin/ai/knowledge/${id.value}`);
    await router.push('/admin/ai/knowledge');
  } catch (error) {
    fail(error, 'Устгаж чадсангүй');
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <NuxtLink to="/admin/ai/knowledge" class="gks-ai-doc__back">← AI мэдлэгийн сан</NuxtLink>
        <h1 class="gks-page__title">{{ document?.title ?? 'Баримт' }}</h1>
        <p v-if="document" class="gks-page__hint">
          {{ KNOWLEDGE_KIND_LABELS[document.kind] }} ·
          {{ document.chunkCount }} chunk ·
          {{ document.indexedAt ? `индексжсэн ${formatNumericDate(document.indexedAt)}` : 'индексжээгүй' }}
        </p>
      </div>

      <div v-if="canWrite && document" class="gks-page__actions">
        <DsButton variant="secondary" icon-left="refresh-cw" @click="reindex">Дахин индексжүүлэх</DsButton>
        <DsButton variant="secondary" icon-left="trash-2" @click="remove">Устгах</DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-ai-doc__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-ai-doc__notice">{{ notice }}</p>

    <template v-if="document">
      <DsCard v-if="document.indexError" title="Индексжүүлэлтийн алдаа">
        <p class="gks-ai-doc__index-error">{{ document.indexError }}</p>
        <p class="gks-page__hint">
          Гурван оролдлогын дараа ажил зогссон. Шалтгааныг зассаны дараа «Дахин индексжүүлэх» дар.
        </p>
      </DsCard>

      <DsCard title="Тохиргоо">
        <p v-if="isMirror" class="gks-ai-doc__mirror">
          Энэ баримт нь контентын хуудсаас автоматаар тусгагдсан
          ({{ document.sourceRef }}). Бичвэрийг эх сурвалж дээрээ засна — дараагийн тусгалд дарагдана.
        </p>

        <form class="gks-form-grid" @submit.prevent="save">
          <DsInput v-model="form.title" label="Гарчиг" :disabled="!canWrite" required />
          <DsSelect v-model="form.category" label="Ангилал" :options="CATEGORY_OPTIONS" :disabled="!canWrite" />
          <DsSelect
            v-model="form.accessLevel"
            label="Хэн харах"
            :options="LEVEL_OPTIONS"
            :disabled="!canWrite || document.kind === 'PLAYBOOK'"
            :hint="document.kind === 'PLAYBOOK' ? 'Заавар үргэлж дотоод' : undefined"
          />
          <DsSelect v-model="form.status" label="Төлөв" :options="STATUS_OPTIONS" :disabled="!canWrite" />
          <DsInput
            v-model="form.validUntil"
            type="date"
            label="Хүчинтэй хугацаа"
            :hint="isStale ? 'Хугацаа дууссан — хайлтад гарахгүй' : 'Дараа нь хайлтаас өөрөө унана'"
            :disabled="!canWrite"
          />
          <DsInput
            v-if="document.kind === 'ENTRY'"
            v-model="form.question"
            label="Асуулт"
            class="gks-form-grid__full"
            :disabled="!canWrite"
          />
          <DsTextarea
            v-if="!isFile"
            v-model="form.body"
            label="Бичвэр"
            :rows="10"
            class="gks-form-grid__full"
            :disabled="!canWrite"
          />
          <p v-else class="gks-page__hint gks-form-grid__full">
            Файлын бичвэр хадгалалтад байна ({{ document.sourceFile }}) — индекс бүрт дахин уншигдана.
            Өөрчлөхийн тулд файлыг дахин байршуулна.
          </p>

          <div v-if="canWrite" class="gks-ai-doc__actions">
            <DsButton type="submit" variant="accent" :disabled="saving">
              {{ saving ? 'Хадгалж байна…' : 'Хадгалах' }}
            </DsButton>
          </div>
        </form>
      </DsCard>

      <DsCard :title="`Chunk (${document.chunks.length})`">
        <p class="gks-page__hint">
          Туслах баримтыг бүхэлд нь биш, chunk-аар уншина. Гарчгийн зам нь chunk-тай хамт
          embed-лэгддэг — тиймээс гарчиггүй урт файл дээрээ хайлтад сул байдаг.
        </p>

        <p v-if="!document.chunks.length" class="gks-empty">
          Chunk байхгүй — баримт индексжээгүй эсвэл бичвэр хоосон.
        </p>

        <ol v-else class="gks-ai-doc__chunks">
          <li v-for="chunk in document.chunks" :key="chunk.id" class="gks-ai-doc__chunk">
            <p class="gks-ai-doc__chunk-head gks-tnum">
              <span>#{{ chunk.chunkIndex + 1 }}</span>
              <span>{{ chunk.tokenCount }} токен</span>
              <span v-if="chunk.heading" class="gks-ai-doc__chunk-heading">{{ chunk.heading }}</span>
            </p>
            <p class="gks-ai-doc__chunk-body">{{ chunk.content }}</p>
          </li>
        </ol>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-ai-doc__back { font-size: var(--fs-micro); color: var(--text-muted); }
.gks-ai-doc__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-ai-doc__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-ai-doc__index-error { color: var(--text-red); font-size: var(--fs-body-sm); white-space: pre-wrap; }
.gks-ai-doc__mirror { margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-ai-doc__actions { grid-column: 1 / -1; display: flex; gap: var(--sp-3); }

.gks-ai-doc__chunks {
  list-style: none;
  margin: var(--sp-4) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.gks-ai-doc__chunk {
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
}

.gks-ai-doc__chunk-head {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-2);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}

.gks-ai-doc__chunk-heading { color: var(--text-brand); }
.gks-ai-doc__chunk-body { margin: 0; font-size: var(--fs-body-sm); color: var(--text-body); white-space: pre-wrap; }
</style>
