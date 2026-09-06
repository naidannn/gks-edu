<script setup lang="ts">
/**
 * Previous / current / next, for a list the API pages.
 *
 * Sixteen list screens had written this nav out by hand, and the copies had
 * drifted in the two ways copies always do: half used a `secondary` button and
 * half a `ghost` one, and half labelled the counter with the muted
 * `gks-pager__status` class while the rest left it plain. Both are now decided
 * here — `variant` stays a prop only because the public catalogue is
 * deliberately quieter than the CRM, not because a page should be free to
 * choose.
 *
 * It renders nothing at all for a single page: a pager on a list that fits on
 * one screen is furniture, not navigation.
 */
withDefaults(
  defineProps<{
    page: number;
    totalPages: number;
    variant?: 'secondary' | 'ghost';
  }>(),
  { variant: 'secondary' },
);

const emit = defineEmits<{ 'update:page': [number] }>();
</script>

<template>
  <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
    <DsButton
      :variant="variant"
      size="sm"
      icon-left="chevron-left"
      :disabled="page <= 1"
      @click="emit('update:page', page - 1)"
    >
      Өмнөх
    </DsButton>
    <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
    <DsButton
      :variant="variant"
      size="sm"
      icon-right="chevron-right"
      :disabled="page >= totalPages"
      @click="emit('update:page', page + 1)"
    >
      Дараах
    </DsButton>
  </nav>
</template>

<style scoped>
.gks-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  flex-wrap: wrap;
}
.gks-pager__status {
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
