<script setup lang="ts">
import type { FaqCategory, FaqEntry } from '@gks/shared';

/** FAQ accordion, grouped by category (1A-13). */

const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  GENERAL: 'Ерөнхий',
  SERVICES: 'Үйлчилгээ',
  PRICING: 'Үнэ, төлбөр',
  DOCUMENTS: 'Материал, бичиг баримт',
  VISA: 'Виз',
  LANGUAGE_CENTER: 'Хэлний сургалтын төв',
};
const CATEGORY_ORDER: FaqCategory[] = ['GENERAL', 'SERVICES', 'PRICING', 'DOCUMENTS', 'VISA', 'LANGUAGE_CENTER'];

const { data, status } = await useApiFetch<FaqEntry[]>('/faqs');

const grouped = computed(() => {
  const byCategory = new Map<FaqCategory, FaqEntry[]>();
  for (const item of data.value ?? []) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }
  return CATEGORY_ORDER.filter((category) => byCategory.has(category)).map((category) => ({
    category,
    label: FAQ_CATEGORY_LABELS[category],
    items: byCategory.get(category)!,
  }));
});

const openId = ref<string | null>(null);
function toggle(id: string) {
  openId.value = openId.value === id ? null : id;
}

useHead({ title: 'Түгээмэл асуулт хариулт' });
useSeoMeta({
  description: 'GKS EDU GROUP-ийн үйлчилгээ, үнэ, материал, визтэй холбоотой түгээмэл асуултын хариулт.',
  ogTitle: 'Түгээмэл асуулт хариулт · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-faq">
    <header class="gks-faq__head">
      <span class="gks-eyebrow">Тусламж</span>
      <h1 class="gks-faq__title">Түгээмэл асуулт хариулт</h1>
      <p class="gks-faq__lede">
        Үйлчилгээ, үнэ төлбөр, материал бүрдүүлэлт, визтэй холбоотой хамгийн олон асуудаг асуултууд.
        Хариулт олдохгүй бол шууд <NuxtLink to="/consultation">зөвлөгөө хүсэлт</NuxtLink> илгээгээрэй.
      </p>
    </header>

    <div v-if="status === 'pending' && !data" class="gks-faq__skeleton">
      <div v-for="n in 4" :key="n" class="gks-faq__skeleton-row" />
    </div>

    <template v-else-if="grouped.length">
      <section v-for="group in grouped" :key="group.category" class="gks-faq__group">
        <h2 class="gks-faq__group-title">{{ group.label }}</h2>
        <ul class="gks-faq__list">
          <li v-for="item in group.items" :key="item.id" class="gks-faq__item">
            <button
              type="button"
              class="gks-faq__question"
              :aria-expanded="openId === item.id"
              @click="toggle(item.id)"
            >
              <span>{{ item.question }}</span>
              <DsIcon :name="openId === item.id ? 'minus' : 'plus'" :size="18" />
            </button>
            <p v-if="openId === item.id" class="gks-faq__answer">{{ item.answer }}</p>
          </li>
        </ul>
      </section>
    </template>

    <DsCard v-else>
      <p class="gks-faq__empty">Одоогоор асуулт хариулт нэмэгдээгүй байна.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-faq { display: flex; flex-direction: column; gap: var(--sp-8); max-width: var(--container-prose); margin: 0 auto; }
.gks-faq__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-faq__lede { margin-top: var(--sp-3); color: var(--text-muted); line-height: var(--lh-body); }
.gks-faq__lede a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }

.gks-faq__group { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-faq__group-title {
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}

.gks-faq__list { display: flex; flex-direction: column; border-top: var(--border-hair) solid var(--line-hairline); }
.gks-faq__item { border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-faq__question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-4) 0;
  background: none;
  border: 0;
  text-align: left;
  font-size: var(--fs-body);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  cursor: pointer;
}
.gks-faq__question :deep(svg),
.gks-faq__question .gks-icon { flex: none; color: var(--text-subtle); }
.gks-faq__answer {
  padding: 0 0 var(--sp-4);
  color: var(--text-muted);
  line-height: var(--lh-body);
  white-space: pre-line;
}

.gks-faq__skeleton { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-faq__skeleton-row {
  height: 52px;
  background: linear-gradient(var(--n-050), var(--n-100));
  border: var(--border-hair) solid var(--line-hairline);
}
.gks-faq__empty { color: var(--text-muted); text-align: center; padding: var(--sp-4) 0; }
</style>
