<script setup lang="ts">
import type { UniversityCard } from '@gks/shared';

const props = defineProps<{ university: UniversityCard }>();

const students = computed(() => formatNumber(props.university.studentsTotal));
const monthlyCost = computed(() =>
  formatKrwRange(
    props.university.livingCost?.monthlyTotalMin,
    props.university.livingCost?.monthlyTotalMax,
  ),
);
</script>

<template>
  <NuxtLink :to="`/universities/${university.slug}`" class="gks-uni-card">
    <div class="gks-uni-card__head">
      <img
        v-if="university.logoPath"
        :src="university.logoPath"
        :alt="`${university.nameMn} лого`"
        class="gks-uni-card__logo"
        loading="lazy"
        width="56"
        height="56"
      >
      <div v-else class="gks-uni-card__logo gks-uni-card__logo--empty" aria-hidden="true">
        <DsIcon name="graduation-cap" :size="24" />
      </div>

      <div class="gks-uni-card__title">
        <h3 class="gks-uni-card__name">{{ university.nameMn }}</h3>
        <p class="gks-uni-card__name-ko">{{ university.nameKo }}</p>
      </div>
    </div>

    <p v-if="university.shortIntroMn" class="gks-uni-card__intro">{{ university.shortIntroMn }}</p>

    <dl class="gks-uni-card__facts">
      <div>
        <dt>Байршил</dt>
        <dd>{{ university.cityMn }}, {{ university.regionMn }}</dd>
      </div>
      <div>
        <dt>Оюутны тоо</dt>
        <dd :class="{ 'gks-uni-card__unknown': !students }">{{ students ?? '—' }}</dd>
      </div>
      <div>
        <dt>Амьжиргаа / сар</dt>
        <dd :class="{ 'gks-uni-card__unknown': !monthlyCost }">{{ monthlyCost ?? '—' }}</dd>
      </div>
    </dl>

    <div class="gks-uni-card__tags">
      <DsBadge tone="neutral">{{ UNIVERSITY_TYPE_LABELS[university.type] }}</DsBadge>
      <DsBadge v-if="university.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл</DsBadge>
      <DsBadge v-if="university.isGksEligible" tone="accent">GKS</DsBadge>
    </div>
  </NuxtLink>
</template>

<style scoped>
.gks-uni-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  height: 100%;
  padding: var(--sp-5);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-1);
  text-decoration: none;
  color: inherit;
  transition: var(--transition-control);
}
.gks-uni-card:hover {
  border-color: var(--line-ink);
  box-shadow: var(--shadow-raised);
}

.gks-uni-card__head { display: flex; align-items: center; gap: var(--sp-4); }
.gks-uni-card__logo {
  width: 56px;
  height: 56px;
  object-fit: contain;
  flex: none;
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  padding: var(--sp-1);
}
.gks-uni-card__logo--empty {
  display: grid;
  place-items: center;
  color: var(--text-subtle);
}
.gks-uni-card__title { min-width: 0; }
.gks-uni-card__name {
  font-family: var(--font-display);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  line-height: var(--lh-snug);
  letter-spacing: var(--ls-heading);
  color: var(--text-strong);
}
.gks-uni-card__name-ko {
  margin-top: 2px;
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}

.gks-uni-card__intro {
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-muted);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gks-uni-card__facts {
  display: grid;
  gap: var(--sp-2);
  margin-top: auto;
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.gks-uni-card__facts > div { display: flex; justify-content: space-between; gap: var(--sp-3); }
.gks-uni-card__facts dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-uni-card__facts dd {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  font-variant-numeric: var(--num-tabular);
  color: var(--text-body);
}
.gks-uni-card__unknown { font-weight: var(--fw-regular); color: var(--text-disabled); }

.gks-uni-card__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
</style>
