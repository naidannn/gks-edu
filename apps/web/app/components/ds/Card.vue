<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    eyebrow?: string;
    /** Body padding token. */
    padding?: string;
    /** 3px red rail across the top — for the one card that needs attention. */
    accent?: boolean;
    /** Cut the top-right corner (the logo's angular motif). Use sparingly. */
    bevel?: boolean;
  }>(),
  { padding: 'var(--sp-6)' },
);
</script>

<template>
  <section class="gks-card" :class="{ 'gks-bevel-tr': bevel, 'gks-card--accent': accent }">
    <header
      v-if="title || eyebrow || $slots.action"
      class="gks-card__header"
      :style="{ padding: `var(--sp-5) ${padding}` }"
    >
      <div class="gks-card__heading">
        <span v-if="eyebrow" class="gks-eyebrow">{{ eyebrow }}</span>
        <h3 v-if="title" class="gks-card__title">{{ title }}</h3>
      </div>
      <div v-if="$slots.action" class="gks-card__action"><slot name="action" /></div>
    </header>
    <div class="gks-card__body" :style="{ padding }"><slot /></div>
  </section>
</template>

<style scoped>
.gks-card {
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-raised);
}
.gks-card--accent { border-top: var(--border-rail) solid var(--red-700); border-start-start-radius: var(--radius-3); border-start-end-radius: var(--radius-3); }

.gks-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-card__heading { display: flex; flex-direction: column; gap: 4px; }
.gks-card__title {
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  font-family: var(--font-display);
  color: var(--text-strong);
}
</style>
