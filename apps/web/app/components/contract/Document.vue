<script setup lang="ts">
/**
 * The contract, drawn the way the office's Word file draws it: letterhead,
 * centred title over its English line, the number/date/city row, justified
 * clauses whose number is bold, centred section headings and the bordered
 * signature table.
 *
 * The same block list feeds the PDF (`contract-pdf.service.ts`), so what a
 * client reads here is what they will find in the downloaded file.
 */
const props = withDefaults(
  defineProps<{
    body: string;
    number?: string | null;
    date?: string | Date | null;
    city?: string;
    title?: string;
    subtitle?: string;
  }>(),
  {
    number: null,
    date: null,
    city: 'Улаанбаатар хот',
    title: 'СУРГАЛТ ЗУУЧЛАЛЫН ГЭРЭЭ',
    subtitle: 'EDUCATIONAL MEDIATION AGREEMENT',
  },
);

const blocks = computed(() => parseContractBody(props.body));
const dateLine = computed(() => formatContractDateMn(props.date));

/** Splits a clause into its bold number and the rest. */
function clauseParts(text: string): { number: string; rest: string } {
  const match = CLAUSE_NUMBER.exec(text);
  return match ? { number: match[1] ?? '', rest: match[2] ?? '' } : { number: '', rest: text };
}

const PARTY_LABEL = /^\p{Lu}[\p{Lu}\s]*:$/u;
</script>

<template>
  <article class="gks-doc">
    <img src="~/assets/img/gks-logo-mark.png" alt="GKS EDU GROUP" class="gks-doc__logo">

    <header class="gks-doc__head">
      <h2 class="gks-doc__title">{{ title }}</h2>
      <p class="gks-doc__subtitle">{{ subtitle }}</p>
    </header>

    <p v-if="number" class="gks-doc__number">№: {{ number }}</p>
    <p v-if="dateLine" class="gks-doc__meta">
      <span>{{ dateLine }}</span>
      <span>{{ city }}</span>
    </p>

    <template v-for="(block, index) in blocks" :key="index">
      <h3 v-if="block.kind === 'heading'" class="gks-doc__section">{{ block.text }}</h3>

      <p v-else-if="block.kind === 'paragraph'" class="gks-doc__clause">
        <strong v-if="clauseParts(block.lines.join(' ')).number">
          {{ clauseParts(block.lines.join(' ')).number }}
        </strong>{{ clauseParts(block.lines.join(' ')).rest }}
      </p>

      <div v-else class="gks-doc__parties">
        <div v-for="(column, side) in block.columns" :key="side" class="gks-doc__party">
          <template v-for="(line, row) in column" :key="row">
            <p v-if="PARTY_LABEL.test(line)" class="gks-doc__party-label">{{ line }}</p>
            <p v-else class="gks-doc__party-line">{{ line }}</p>
          </template>
        </div>
      </div>
    </template>
  </article>
</template>

<style scoped>
.gks-doc {
  /* A page, not a column of the screen: the Word file's text measure is 6.5in,
     and a contract read at full window width stops looking like a contract. */
  max-width: 52rem;
  margin: 0 auto;
  background: #ffffff;
  color: var(--ink-900);
  padding: var(--sp-7) var(--sp-6);
  font-size: var(--fs-body-sm);
  line-height: 1.55;
}
.gks-doc__logo { height: 34px; width: auto; display: block; margin-bottom: var(--sp-5); }

.gks-doc__head { text-align: center; }
.gks-doc__title { font-size: var(--fs-body-sm); font-weight: var(--fw-bold); letter-spacing: 0.01em; }
.gks-doc__subtitle { font-size: var(--fs-body-sm); font-style: italic; }

.gks-doc__number { margin-top: var(--sp-5); font-weight: var(--fw-bold); }
.gks-doc__meta { display: flex; gap: var(--sp-6); }
.gks-doc__meta span:first-child { flex: 0 0 51.6%; }

.gks-doc__section {
  margin: var(--sp-5) 0 var(--sp-3);
  text-align: center;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-bold);
}

/* Word sets clauses solid: no space between them, a quarter-inch first line. */
.gks-doc__clause { text-align: justify; text-indent: 18px; hyphens: auto; }
.gks-doc__clause strong { font-weight: var(--fw-bold); }

.gks-doc__parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: var(--sp-5);
  border: 1px solid var(--ink-900);
}
.gks-doc__party { padding: var(--sp-3); }
.gks-doc__party + .gks-doc__party { border-left: 1px solid var(--ink-900); }
.gks-doc__party-label { font-weight: var(--fw-bold); }
.gks-doc__party-line { min-height: 1.55em; overflow-wrap: anywhere; }

@media (max-width: 640px) {
  .gks-doc__meta { flex-direction: column; gap: 0; }
  .gks-doc__parties { grid-template-columns: 1fr; }
  .gks-doc__party + .gks-doc__party { border-left: 0; border-top: 1px solid var(--ink-900); }
}
</style>
