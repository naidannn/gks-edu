<script setup lang="ts">
import type { CatalogueProgressRow } from '@gks/shared';

/** Logo and name, linking to the school's admin page — the first cell of every tab. */
defineProps<{ school: CatalogueProgressRow }>();
</script>

<template>
  <NuxtLink :to="`/admin/universities/${school.id}`" class="cp-school">
    <span class="cp-school__rank gks-tnum" title="Каталогийн дараалал">{{ school.gksRank ? `#${school.gksRank}` : '—' }}</span>
    <img v-if="school.logoPath" :src="school.logoPath" alt="" class="cp-school__logo" loading="lazy">
    <span v-else class="cp-school__logo cp-school__logo--empty" aria-hidden="true">
      <DsIcon name="school" :size="14" />
    </span>
    <span class="cp-school__names">
      <span class="gks-cell-name">{{ universityName(school) }}</span>
      <span class="gks-cell-sub">{{ school.nameKo }}</span>
    </span>
  </NuxtLink>
</template>

<style scoped>
.cp-school { display: flex; align-items: center; gap: var(--sp-3); color: inherit; text-decoration: none; min-width: 0; }
.cp-school:hover .gks-cell-name { color: var(--brand-700); text-decoration: underline; }
.cp-school__names { min-width: 0; }
.cp-school__rank { min-width: 34px; flex: 0 0 auto; font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-subtle); }
.cp-school__logo { width: 28px; height: 28px; flex: 0 0 auto; object-fit: contain; border-radius: var(--radius-1); background: var(--n-000); }
.cp-school__logo--empty { display: inline-flex; align-items: center; justify-content: center; color: var(--text-subtle); background: var(--surface-sunken); }
</style>
