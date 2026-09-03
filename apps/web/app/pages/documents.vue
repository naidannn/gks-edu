<script setup lang="ts">
import type { PaginatedResult } from '@gks/shared';

definePageMeta({ middleware: 'auth' });
useHead({ title: 'Баримт' });

interface DocumentListItem {
  id: string;
  title: string;
  source: string | null;
  createdAt: string;
  _count: { chunks: number };
}

const api = useApi();

const title = ref('');
const rawChunks = ref('');
const pending = ref(false);
const error = ref<string | null>(null);

const { data, refresh } = await useAsyncData('documents', () =>
  api.get<PaginatedResult<DocumentListItem>>('/documents?page=1&limit=20'),
);

async function create() {
  error.value = null;

  const chunks = rawChunks.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!title.value.trim() || chunks.length === 0) {
    error.value = 'Гарчиг болон дор хаяж нэг мөр шаардлагатай';
    return;
  }

  pending.value = true;
  try {
    await api.post('/documents', { title: title.value.trim(), chunks });
    title.value = '';
    rawChunks.value = '';
    await refresh();
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    pending.value = false;
  }
}

async function remove(id: string) {
  await api.delete(`/documents/${id}`);
  await refresh();
}
</script>

<template>
  <section class="gks-page">
    <div>
      <h1 class="gks-page__title">Баримтууд</h1>
      <p class="gks-page__lede">Мөр бүр нэг chunk болж embed хийгдэн pgvector-т хадгалагдана.</p>
    </div>

    <DsCard>
      <form class="gks-doc-form" @submit.prevent="create">
        <DsInput v-model="title" label="Гарчиг" placeholder="Гарчиг" />
        <DsTextarea v-model="rawChunks" label="Агуулга" :rows="4" placeholder="Мөр тус бүр нэг chunk…" />
        <p v-if="error" class="gks-doc-form__error">{{ error }}</p>
        <DsButton type="submit" :disabled="pending" :loading="pending">
          {{ pending ? 'Хадгалж байна…' : 'Нэмэх' }}
        </DsButton>
      </form>
    </DsCard>

    <ul v-if="data?.items.length" class="gks-doc-list">
      <li v-for="doc in data.items" :key="doc.id">
        <DsCard :padding="'var(--sp-4)'">
          <div class="gks-doc-row">
            <div>
              <p class="gks-doc-row__title">{{ doc.title }}</p>
              <p class="gks-doc-row__meta gks-tnum">
                {{ doc._count.chunks }} chunk · {{ new Date(doc.createdAt).toLocaleString('mn-MN') }}
              </p>
            </div>
            <DsButton variant="danger" size="sm" icon-left="trash-2" @click="remove(doc.id)">Устгах</DsButton>
          </div>
        </DsCard>
      </li>
    </ul>
    <p v-else class="gks-page__lede">Одоогоор баримт алга.</p>
  </section>
</template>

<style scoped>
.gks-page { display: flex; flex-direction: column; gap: var(--sp-8); }
.gks-page__title { font-size: var(--fs-h1); font-weight: var(--fw-bold); }
.gks-page__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-doc-form { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-doc-form__error { font-size: var(--fs-caption); color: var(--red-800); }

.gks-doc-list { display: flex; flex-direction: column; gap: var(--sp-2); list-style: none; margin: 0; padding: 0; }
.gks-doc-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); }
.gks-doc-row__title { font-weight: var(--fw-medium); color: var(--text-body); }
.gks-doc-row__meta { margin-top: 2px; font-size: var(--fs-micro); color: var(--text-subtle); }
</style>
