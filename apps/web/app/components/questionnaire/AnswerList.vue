<script setup lang="ts">
import type { QuestionnaireAnswers, QuestionnaireDefinition } from '@gks/shared';

/**
 * A questionnaire read back, section by section (1D-27) — what the writer
 * works from, and what the client sees once they have sent it. Questions a
 * gate skipped are left out; questions left empty stay in and say so, because
 * the writer needs to see the gap to ask about it.
 */
const props = withDefaults(
  defineProps<{
    definition: QuestionnaireDefinition;
    answers: QuestionnaireAnswers;
    /** Hide the unanswered ones — for the client's own read-back. */
    answeredOnly?: boolean;
  }>(),
  { answeredOnly: false },
);

const sections = computed(() =>
  props.definition.parts.flatMap((part) =>
    part.sections.map((section) => ({
      key: `${part.id}.${section.id}`,
      part,
      section,
      rows: visibleQuestions(section, props.answers)
        .filter((question) => !props.answeredOnly || isAnswered(props.answers[question.id]))
        .map((question) => ({ question, value: props.answers[question.id] ?? '' })),
    })),
  ),
);

function display(kind: string | undefined, value: string): string {
  if (kind === 'yesno') return value === 'yes' ? 'Тийм' : value === 'no' ? 'Үгүй' : '';
  return value.trim();
}
</script>

<template>
  <div class="gks-qa">
    <section v-for="entry in sections" v-show="entry.rows.length" :key="entry.key" class="gks-qa__section">
      <p class="gks-eyebrow">{{ entry.part.title }}<template v-if="entry.part.titleEn"> · {{ entry.part.titleEn }}</template></p>
      <h3 class="gks-qa__title">{{ entry.section.title }}</h3>
      <dl class="gks-qa__list">
        <div v-for="row in entry.rows" :key="row.question.id" class="gks-qa__row">
          <dt class="gks-qa__q">
            {{ row.question.label }}<span v-if="row.question.required" class="gks-qa__req">*</span>
          </dt>
          <dd class="gks-qa__a" :class="{ 'gks-qa__a--empty': !display(row.question.kind, row.value) }">
            {{ display(row.question.kind, row.value) || 'Хариулаагүй' }}
          </dd>
        </div>
      </dl>
    </section>
  </div>
</template>

<style scoped>
.gks-qa { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-qa__section { display: flex; flex-direction: column; gap: var(--sp-2); break-inside: avoid-page; }
.gks-qa__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-qa__list { display: flex; flex-direction: column; }
.gks-qa__row { padding: var(--sp-3) 0; border-top: var(--border-hair) solid var(--line-hairline); break-inside: avoid; }
.gks-qa__q { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-muted); }
.gks-qa__req { color: var(--red-700); margin-left: 2px; }
.gks-qa__a { margin-top: var(--sp-1); white-space: pre-wrap; font-size: var(--fs-body); line-height: var(--lh-body); color: var(--text-body); }
.gks-qa__a--empty { color: var(--text-subtle); font-style: italic; font-size: var(--fs-body-sm); }
</style>
