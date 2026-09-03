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
  <section class="space-y-8">
    <div>
      <h1 class="text-2xl font-bold">Баримтууд</h1>
      <p class="mt-1 text-sm text-neutral-500">
        Мөр бүр нэг chunk болж embed хийгдэн pgvector-т хадгалагдана.
      </p>
    </div>

    <form
      class="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      @submit.prevent="create"
    >
      <input
        v-model="title"
        type="text"
        placeholder="Гарчиг"
        class="w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950"
      >
      <textarea
        v-model="rawChunks"
        rows="4"
        placeholder="Мөр тус бүр нэг chunk…"
        class="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
      <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
      <button
        type="submit"
        :disabled="pending"
        class="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {{ pending ? 'Хадгалж байна…' : 'Нэмэх' }}
      </button>
    </form>

    <ul v-if="data?.items.length" class="space-y-2">
      <li
        v-for="doc in data.items"
        :key="doc.id"
        class="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div>
          <p class="font-medium">{{ doc.title }}</p>
          <p class="text-xs text-neutral-500">
            {{ doc._count.chunks }} chunk · {{ new Date(doc.createdAt).toLocaleString('mn-MN') }}
          </p>
        </div>
        <button type="button" class="text-sm text-red-600 hover:underline" @click="remove(doc.id)">
          Устгах
        </button>
      </li>
    </ul>
    <p v-else class="text-sm text-neutral-500">Одоогоор баримт алга.</p>
  </section>
</template>
