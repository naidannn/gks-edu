<script setup lang="ts">
definePageMeta({ middleware: 'auth' });
useHead({ title: 'Векторын хайлт' });

interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

const api = useApi();

const query = ref('');
const hits = ref<SearchHit[]>([]);
const pending = ref(false);
const error = ref<string | null>(null);
const searched = ref(false);

async function search() {
  if (!query.value.trim()) return;

  pending.value = true;
  error.value = null;
  try {
    hits.value = await api.post<SearchHit[]>('/documents/search', {
      query: query.value.trim(),
      limit: 10,
    });
    searched.value = true;
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Векторын хайлт</h1>
      <p class="mt-1 text-sm text-neutral-500">
        pgvector-ийн cosine зайгаар (<code>&lt;=&gt;</code>) хамгийн ойр chunk-уудыг олно.
      </p>
    </div>

    <form class="flex gap-2" @submit.prevent="search">
      <input
        v-model="query"
        type="search"
        placeholder="Асуултаа бичнэ үү…"
        class="flex-1 rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
      >
      <button
        type="submit"
        :disabled="pending"
        class="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {{ pending ? '…' : 'Хайх' }}
      </button>
    </form>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <ul v-if="hits.length" class="space-y-2">
      <li
        v-for="hit in hits"
        :key="hit.chunkId"
        class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div class="flex items-baseline justify-between gap-4">
          <p class="text-sm font-medium text-brand-700 dark:text-brand-300">
            {{ hit.documentTitle }} #{{ hit.chunkIndex }}
          </p>
          <span class="shrink-0 text-xs tabular-nums text-neutral-500">
            {{ hit.similarity.toFixed(4) }}
          </span>
        </div>
        <p class="mt-2 text-sm">{{ hit.content }}</p>
      </li>
    </ul>

    <p v-else-if="searched && !pending" class="text-sm text-neutral-500">
      Илэрц олдсонгүй.
    </p>

    <p class="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      Анхаар: default embedding нь тест зориулалтын deterministic stub. Утга учиртай илэрц авахын тулд
      <code>apps/api/src/modules/vector/embedding.service.ts</code>-д жинхэнэ embedding модель холбоно уу.
    </p>
  </section>
</template>
