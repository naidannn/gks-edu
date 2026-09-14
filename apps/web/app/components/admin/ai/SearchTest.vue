<script setup lang="ts">
import type { AccessLevel, KnowledgeSearchHit } from '@gks/shared';

/**
 * "Test the search" (2E-01).
 *
 * The one screen that answers the question staff actually have about the
 * knowledge base: *would the assistant find this?* It runs the real hybrid
 * retrieval, so what comes back is what a turn would be answered from — and the
 * level selector is the important half. Asking as a visitor is how somebody
 * checks that a document they wrote for clients is not being read out to
 * everybody, and that one they wrote for everybody is reachable at all.
 *
 * Scores are shown because they are the only way to see *why* something ranked:
 * which legs of the search matched, and how close the meaning was. A consultant
 * is capped at CONTRACTED by the API — the box must not become a way to read the
 * internal documents the list hides.
 */
const props = defineProps<{ canProbeInternal: boolean }>();

const api = useApi();

const LEVELS: { value: AccessLevel; label: string }[] = [
  { value: 'PUBLIC', label: 'Зочин (нэвтрээгүй)' },
  { value: 'REGISTERED', label: 'Бүртгэлтэй хэрэглэгч' },
  { value: 'CONTRACTED', label: 'Гэрээтэй үйлчлүүлэгч' },
  { value: 'INTERNAL', label: 'Ажилтан (дотоод)' },
];

const levelOptions = computed(() =>
  props.canProbeInternal ? LEVELS : LEVELS.filter((level) => level.value !== 'INTERNAL'),
);

const query = ref('');
const level = ref<AccessLevel>(props.canProbeInternal ? 'INTERNAL' : 'CONTRACTED');
const hits = ref<KnowledgeSearchHit[] | null>(null);
const pending = ref(false);
const error = ref<string | null>(null);

async function run() {
  if (!query.value.trim()) return;

  pending.value = true;
  error.value = null;
  try {
    hits.value = await api.post<KnowledgeSearchHit[]>('/admin/ai/knowledge/search-test', {
      query: query.value.trim(),
      accessLevel: level.value,
      limit: 10,
    });
  } catch (err) {
    error.value = apiErrorMessage(err, 'Хайлтыг туршиж чадсангүй');
  } finally {
    pending.value = false;
  }
}

/** Enough of a chunk to recognise it, not enough to read the whole base here. */
function snippet(content: string): string {
  return content.length > 240 ? `${content.slice(0, 240)}…` : content;
}
</script>

<template>
  <DsCard title="Хайлт турших">
    <form class="gks-ai-test__form" @submit.prevent="run">
      <DsInput
        v-model="query"
        label="Асуулт"
        placeholder="Жишээ: дотуур байр хэдэн төгрөг вэ"
        class="gks-ai-test__query"
      />
      <DsSelect v-model="level" label="Хэний эрхээр" :options="levelOptions" />
      <DsButton type="submit" variant="accent" :disabled="pending || !query.trim()">
        {{ pending ? 'Хайж байна…' : 'Турших' }}
      </DsButton>
    </form>

    <p v-if="error" class="gks-ai-test__error">{{ error }}</p>

    <template v-if="hits">
      <p v-if="!hits.length" class="gks-empty">
        Энэ эрхийн түвшинд таарах баримт олдсонгүй — туслах «баталгаатай хариулт алга» гэж хэлнэ.
      </p>

      <ol v-else class="gks-ai-test__hits">
        <li v-for="hit in hits" :key="hit.chunkId" class="gks-ai-test__hit">
          <div class="gks-ai-test__hit-head">
            <NuxtLink :to="`/admin/ai/knowledge/${hit.documentId}`" class="gks-ai-test__hit-title">
              {{ hit.title }}
            </NuxtLink>
            <DsBadge tone="neutral">{{ ACCESS_LEVEL_LABELS[hit.accessLevel] }}</DsBadge>
          </div>

          <p class="gks-ai-test__hit-meta gks-tnum">
            <span v-for="leg in hit.matchedBy" :key="leg" class="gks-ai-test__leg">{{ SEARCH_LEG_LABELS[leg] }}</span>
            <span>оноо {{ hit.score.toFixed(4) }}</span>
            <span>{{ hit.similarity === null ? 'утгын таарал — үгүй' : `утга ${hit.similarity.toFixed(3)}` }}</span>
          </p>

          <p v-if="hit.heading" class="gks-ai-test__hit-heading">{{ hit.heading }}</p>
          <p class="gks-ai-test__hit-body">{{ snippet(hit.content) }}</p>
        </li>
      </ol>
    </template>
  </DsCard>
</template>

<style scoped>
.gks-ai-test__form {
  display: grid;
  grid-template-columns: 1fr 14rem auto;
  gap: var(--sp-3);
  align-items: end;
}

.gks-ai-test__error { margin-top: var(--sp-3); color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-ai-test__hits {
  list-style: none;
  margin: var(--sp-4) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.gks-ai-test__hit {
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
}

.gks-ai-test__hit-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); }
.gks-ai-test__hit-title { font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-ai-test__hit-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: var(--sp-1) 0 var(--sp-2);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}

.gks-ai-test__leg {
  padding: 0 6px;
  border-radius: var(--radius-1);
  background: var(--surface-hover);
  color: var(--text-body);
}

.gks-ai-test__hit-heading { margin: 0; font-size: var(--fs-micro); color: var(--text-brand); }
.gks-ai-test__hit-body { margin: 2px 0 0; font-size: var(--fs-body-sm); color: var(--text-body); white-space: pre-wrap; }

@media (max-width: 900px) {
  .gks-ai-test__form { grid-template-columns: 1fr; }
}
</style>
