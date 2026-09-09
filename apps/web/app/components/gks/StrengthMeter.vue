<script setup lang="ts">
import type { GksReadinessBand } from '@gks/shared';

/**
 * How strong an application is, as three steps rather than a number.
 *
 * The page used to put a 0–100 dial here. It read as a mark, and a mark is the
 * one thing this page must not hand somebody who arrived afraid of being judged
 * — they stop reading the advice beside it and start comparing themselves to
 * the figure. Three named steps say the same thing, and the step that is lit is
 * a place in a process rather than a score out of anything.
 *
 * Every step is a person who may still apply this season, so the lowest one is
 * drawn in the same calm blue as the others, never in a warning colour.
 */
const props = defineProps<{ band: GksReadinessBand; label: string }>();

const STEPS: GksReadinessBand[] = ['DEVELOPING', 'MODERATE', 'STRONG'];

const reached = computed(() => STEPS.indexOf(props.band));
</script>

<template>
  <div class="gks-meter" :class="`gks-meter--${band.toLowerCase()}`">
    <div class="gks-meter__steps" role="img" :aria-label="`Материалын байдал: ${label}`">
      <span
        v-for="(step, index) in STEPS"
        :key="step"
        class="gks-meter__step"
        :class="{ 'gks-meter__step--on': index <= reached }"
      />
    </div>
    <p>
      <small>Материалын өнөөдрийн байдал</small>
      <strong>{{ label }}</strong>
    </p>
  </div>
</template>

<style scoped>
/* A banner across the top of the card rather than a column beside the list.
   The list is the substance here and wants the full width; the summary is one
   short phrase and does not need a column of its own to say it. */
.gks-meter {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-hover);
}

.gks-meter p {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  min-width: 0;
}

.gks-meter__steps {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-1);
  flex: none;
  width: 56px;
  height: 34px;
}

.gks-meter__step {
  flex: 1;
  border-radius: var(--radius-1);
  background: var(--line-hairline);
}

/* Ascending, so the shape itself reads as a progression — but the first step
   still has to read as a bar rather than a dot: it is where most first-time
   visitors land, and a dot looks like a failure mark. */
.gks-meter__step:nth-child(1) { height: 55%; }
.gks-meter__step:nth-child(2) { height: 78%; }
.gks-meter__step:nth-child(3) { height: 100%; }

.gks-meter__step--on {
  background: var(--line-accent);
}

.gks-meter--strong .gks-meter__step--on {
  background: var(--success-fg);
}

.gks-meter strong {
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  line-height: var(--lh-snug);
  letter-spacing: var(--ls-heading);
  order: 2;
}

.gks-meter small {
  order: 1;
}

.gks-meter--strong strong {
  color: var(--success-fg);
}

.gks-meter small {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}
</style>
