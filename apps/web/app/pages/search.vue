<script setup lang="ts">
definePageMeta({ middleware: 'auth' });
useHead({ title: 'Векторын хайлт' });
useNoIndex();

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
  <section class="gks-page">
    <div>
      <h1 class="gks-page__title">Векторын хайлт</h1>
      <p class="gks-page__lede">
        pgvector-ийн cosine зайгаар (<code class="gks-code">&lt;=&gt;</code>) хамгийн ойр chunk-уудыг олно.
      </p>
    </div>

    <form class="gks-search-form" @submit.prevent="search">
      <DsInput v-model="query" type="search" icon-left="search" placeholder="Асуултаа бичнэ үү…" style="flex: 1" />
      <DsButton type="submit" :disabled="pending" :loading="pending">{{ pending ? '…' : 'Хайх' }}</DsButton>
    </form>

    <p v-if="error" class="gks-search-error">{{ error }}</p>

    <ul v-if="hits.length" class="gks-hit-list">
      <li v-for="hit in hits" :key="hit.chunkId">
        <DsCard>
          <div class="gks-hit">
            <p class="gks-hit__title">{{ hit.documentTitle }} #{{ hit.chunkIndex }}</p>
            <span class="gks-hit__score gks-tnum">{{ hit.similarity.toFixed(4) }}</span>
          </div>
          <p class="gks-hit__content">{{ hit.content }}</p>
        </DsCard>
      </li>
    </ul>

    <p v-else-if="searched && !pending" class="gks-page__lede">Илэрц олдсонгүй.</p>

    <DsCard padding="var(--sp-4)" style="background: var(--warning-bg); border-color: var(--warning-line);">
      <p class="gks-search-note">
        Анхаар: default embedding нь тест зориулалтын deterministic stub. Утга учиртай илэрц авахын тулд
        <code class="gks-code">apps/api/src/modules/vector/embedding.service.ts</code>-д жинхэнэ embedding
        модель холбоно уу.
      </p>
    </DsCard>
  </section>
</template>

<style scoped>
.gks-page { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-page__title { font-size: var(--fs-h1); font-weight: var(--fw-bold); }
.gks-page__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-code {
  border-radius: var(--radius-1);
  background: var(--n-100);
  padding: 2px var(--sp-1);
  font-family: var(--font-mono);
  font-size: .9em;
}

.gks-search-form { display: flex; gap: var(--sp-2); }
.gks-search-error { font-size: var(--fs-body-sm); color: var(--red-800); }

.gks-hit-list { display: flex; flex-direction: column; gap: var(--sp-2); list-style: none; margin: 0; padding: 0; }
.gks-hit { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-4); }
.gks-hit__title { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--brand-700); }
.gks-hit__score { flex-shrink: 0; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-hit__content { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }

.gks-search-note { font-size: var(--fs-caption); color: var(--warning-fg); }
</style>
