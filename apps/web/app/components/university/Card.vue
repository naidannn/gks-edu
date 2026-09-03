<script setup lang="ts">
import type { UniversityCard } from '@gks/shared';

const props = withDefaults(
  defineProps<{
    university: UniversityCard;
    nameLanguage?: 'mn' | 'en';
    showLivingCost?: boolean;
  }>(),
  { nameLanguage: 'mn', showLivingCost: true },
);

const students = computed(() => formatNumber(props.university.studentsTotal));
const displayName = computed(() =>
  props.nameLanguage === 'en' ? props.university.nameEn : props.university.nameMn,
);
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
        width="72"
        height="72"
      >
      <div v-else class="gks-uni-card__logo gks-uni-card__logo--empty" aria-hidden="true">
        <DsIcon name="graduation-cap" :size="24" />
      </div>

      <div class="gks-uni-card__title">
        <span v-if="university.type !== 'NATIONAL'" class="gks-uni-card__type">
          {{ UNIVERSITY_TYPE_LABELS[university.type] }}
        </span>
        <h3 class="gks-uni-card__name">{{ displayName }}</h3>
        <p class="gks-uni-card__name-ko">{{ university.nameKo }}</p>
      </div>
    </div>

    <dl class="gks-uni-card__facts">
      <div>
        <dt>Байршил</dt>
        <dd>{{ university.cityMn }}, {{ university.regionMn }}</dd>
      </div>
      <div>
        <dt>Оюутны тоо</dt>
        <dd :class="{ 'gks-uni-card__unknown': !students }">{{ students ?? '—' }}</dd>
      </div>
      <div v-if="showLivingCost">
        <dt>Амьжиргаа / сар</dt>
        <dd :class="{ 'gks-uni-card__unknown': !monthlyCost }">{{ monthlyCost ?? '—' }}</dd>
      </div>
    </dl>

    <div class="gks-uni-card__tags">
      <DsBadge v-if="university.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл</DsBadge>
      <DsBadge v-if="university.isGksEligible" tone="accent">GKS</DsBadge>
    </div>
  </NuxtLink>
</template>

<style scoped>
.gks-uni-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
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
  width: 72px;
  height: 72px;
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
.gks-uni-card__type {
  display: inline-flex;
  margin-bottom: 3px;
  padding: 2px 6px;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-subtle);
  font-size: 9px;
  font-weight: var(--fw-bold);
  line-height: 1.2;
  letter-spacing: .04em;
  text-transform: uppercase;
}
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
