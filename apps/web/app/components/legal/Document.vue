<script setup lang="ts">
/**
 * 1A-33 — the shared shape of the three legal pages: eyebrow → title → lede →
 * the date they were last amended → a table of contents → numbered sections →
 * the office's contact block.
 *
 * The pages themselves carry nothing but their text, as data. Prose in a
 * `blocks` array rather than in the template is what lets all three share one
 * layout, one heading scale and one anchor scheme — a legal page whose section
 * numbering drifts from its neighbour's reads as carelessness about the text
 * itself.
 */
/**
 * One date for all three documents: they were written together and are amended
 * together, so a per-page date would only invite them to drift apart. Update it
 * whenever any of the three changes in substance.
 */
const LEGAL_UPDATED_AT = '2026 оны 9 дүгээр сарын 6';

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  /** A boxed aside — the one sentence in the section that must not be skimmed past. */
  | { type: 'note'; text: string };

export interface LegalSection {
  /** Anchor id; also what the table of contents links to. */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

const props = defineProps<{
  eyebrow: string;
  title: string;
  lede: string;
  sections: LegalSection[];
}>();

const route = useRoute();

/**
 * The three documents cross-reference each other, and doing it from here means
 * a page can never link to itself or forget a sibling.
 */
const LEGAL_PAGES = [
  { to: '/terms', label: 'Үйлчилгээний нөхцөл' },
  { to: '/privacy', label: 'Нууцлалын бодлого' },
  { to: '/refund', label: 'Төлбөр, буцаалтын журам' },
];

const related = computed(() => LEGAL_PAGES.filter((page) => page.to !== route.path));

/** Sections are numbered by position, so inserting one never leaves a gap. */
const numbered = computed(() =>
  props.sections.map((section, index) => ({ ...section, number: index + 1 })),
);
</script>

<template>
  <article class="legal">
    <header class="legal__head">
      <p class="gks-eyebrow">{{ eyebrow }}</p>
      <h1 class="legal__title">{{ title }}</h1>
      <p class="legal__lede">{{ lede }}</p>
      <p class="legal__meta">
        <DsIcon name="calendar-clock" :size="15" />
        <span>Сүүлд шинэчилсэн: <strong class="gks-tnum">{{ LEGAL_UPDATED_AT }}</strong></span>
      </p>
    </header>

    <nav class="legal__toc" aria-label="Гарчиг">
      <p class="legal__toc-title">Агуулга</p>
      <ol class="legal__toc-list">
        <li v-for="section in numbered" :key="section.id">
          <a :href="`#${section.id}`">
            <span class="legal__toc-num gks-tnum">{{ section.number }}.</span>
            <span>{{ section.title }}</span>
          </a>
        </li>
      </ol>
    </nav>

    <section v-for="section in numbered" :id="section.id" :key="section.id" class="legal__section">
      <h2 class="legal__h2">
        <span class="legal__h2-num gks-tnum">{{ section.number }}.</span>
        {{ section.title }}
      </h2>

      <template v-for="(block, index) in section.blocks" :key="index">
        <p v-if="block.type === 'p'" class="legal__p">{{ block.text }}</p>
        <ul v-else-if="block.type === 'list'" class="legal__list">
          <li v-for="item in block.items" :key="item">
            <DsIcon name="dot" :size="18" light />
            <span>{{ item }}</span>
          </li>
        </ul>
        <p v-else class="legal__note">
          <DsIcon name="info" :size="17" />
          <span>{{ block.text }}</span>
        </p>
      </template>
    </section>

    <footer class="legal__foot">
      <div class="legal__contact">
        <h2 class="legal__foot-title">Асуулт байвал</h2>
        <p class="legal__p">
          Энэ баримт бичигтэй холбоотой асуулт, хүсэлтээ дараах хаягаар ирүүлнэ үү.
          Ажлын цаг: {{ COMPANY.workingHours }}.
        </p>
        <ul class="legal__contact-list">
          <li>
            <DsIcon name="building-2" :size="17" light />
            <span>{{ COMPANY.legalName }}</span>
          </li>
          <li>
            <DsIcon name="phone" :size="17" light />
            <a :href="`tel:${COMPANY.phone}`" class="gks-tnum">{{ COMPANY.phoneLabel }}</a>
          </li>
          <li>
            <DsIcon name="mail" :size="17" light />
            <a :href="`mailto:${COMPANY.email}`">{{ COMPANY.email }}</a>
          </li>
          <li>
            <DsIcon name="map-pin" :size="17" light />
            <span>{{ COMPANY.addressOneLine }}</span>
          </li>
        </ul>
      </div>

      <nav class="legal__related" aria-label="Холбоотой хуудас">
        <p class="legal__foot-title">Холбоотой</p>
        <NuxtLink v-for="page in related" :key="page.to" :to="page.to" class="legal__related-link">
          <span>{{ page.label }}</span>
          <DsIcon name="arrow-right" :size="16" />
        </NuxtLink>
      </nav>
    </footer>
  </article>
</template>

<style scoped>
.legal {
  max-width: var(--container-prose);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-8);
}

.legal__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.legal__lede { margin-top: var(--sp-3); color: var(--text-muted); line-height: var(--lh-body); }
.legal__meta {
  margin-top: var(--sp-4);
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}

/* ---- Table of contents ---- */
.legal__toc {
  padding: var(--sp-5) var(--sp-6);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
}
.legal__toc-title {
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.legal__toc-list {
  margin-top: var(--sp-3);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2) var(--sp-6);
  list-style: none;
}
.legal__toc-list a {
  display: flex;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  color: var(--text-body);
  text-decoration: none;
}
.legal__toc-list a:hover { color: var(--brand-600); text-decoration: underline; }
.legal__toc-num { color: var(--text-subtle); }

/* ---- Sections ---- */
.legal__section { scroll-margin-top: 88px; }
.legal__h2 {
  display: flex;
  gap: var(--sp-2);
  font-size: var(--fs-h4);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.legal__h2-num { color: var(--brand-600); }

.legal__p {
  margin-top: var(--sp-3);
  color: var(--text-body);
  line-height: var(--lh-body);
}
.legal__list { margin-top: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); list-style: none; }
.legal__list li {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-1);
  color: var(--text-body);
  line-height: var(--lh-body);
}
.legal__list li .gks-icon { margin-top: 3px; color: var(--brand-500); }

.legal__note {
  margin-top: var(--sp-4);
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-left: 3px solid var(--brand-400);
  border-radius: var(--radius-1);
  background: var(--surface-brand-soft);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-body);
}
.legal__note .gks-icon { margin-top: 2px; color: var(--brand-600); }

/* ---- Footer ---- */
.legal__foot {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: var(--sp-6);
  padding-top: var(--sp-7);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.legal__foot-title {
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.legal__contact-list {
  margin-top: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  list-style: none;
  font-size: var(--fs-body-sm);
  color: var(--text-body);
}
.legal__contact-list li { display: flex; align-items: flex-start; gap: var(--sp-2); }
.legal__contact-list .gks-icon { margin-top: 2px; }

.legal__related { display: flex; flex-direction: column; gap: var(--sp-2); }
.legal__related-link {
  margin-top: var(--sp-1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-body);
  text-decoration: none;
  transition: var(--transition-control);
}
.legal__related-link:hover { border-color: var(--brand-300); color: var(--brand-700); }

@media (max-width: 640px) {
  .legal__toc-list { grid-template-columns: 1fr; }
  .legal__foot { grid-template-columns: 1fr; }
}
</style>
