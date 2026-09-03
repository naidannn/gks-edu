<script setup lang="ts">
/**
 * Provenance marker for one field. Every university record carries a `quality`
 * block saying whether a value is verified, editorial or estimated — the
 * catalogue says so rather than presenting everything as equally certain.
 */
const props = defineProps<{ source: string }>();

const TONES = {
  verified: { tone: 'success', label: 'Баталгаажсан', icon: 'check' },
  editorial: { tone: 'info', label: 'Редакцийн', icon: 'pencil' },
  estimated: { tone: 'warning', label: 'Тооцоолсон', icon: 'circle-help' },
} as const;

/** The dataset writes free-form provenance strings; group them into three tones. */
const kind = computed<keyof typeof TONES>(() => {
  const source = props.source.toLowerCase();
  if (source.includes('curated') || source.includes('editorial')) return 'editorial';
  if (source.includes('estimate') || source.includes('тооцоол')) return 'estimated';
  return 'verified';
});

const badge = computed(() => TONES[kind.value]);
</script>

<template>
  <DsBadge :tone="badge.tone" :icon="badge.icon" :title="source">{{ badge.label }}</DsBadge>
</template>
