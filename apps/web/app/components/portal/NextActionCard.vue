<script setup lang="ts">
import type { NextAction } from '@gks/shared';

/**
 * "Дараа нь юу хийх вэ?" — the server decides this (1G-15); the card only
 * offers a button when the ball is actually with the client.
 */
const props = defineProps<{
  action: NextAction;
  caseId: string;
  /** Hides the CTA on the screen the action already points at. */
  hideLink?: boolean;
}>();

const ACTOR_LABEL: Record<NextAction['actor'], string> = {
  CLIENT: 'Таны хийх алхам',
  STAFF: 'Ажилтны талд',
  SCHOOL: 'Сургуулийн талд',
  NONE: 'Мэдээлэл',
};

const ACTOR_ICON: Record<NextAction['actor'], string> = {
  CLIENT: 'circle-arrow-right',
  STAFF: 'clock',
  SCHOOL: 'graduation-cap',
  NONE: 'circle-check',
};

const to = computed(() =>
  props.action.tab === 'overview'
    ? `/app/cases/${props.caseId}`
    : `/app/cases/${props.caseId}/${props.action.tab}`,
);
const showLink = computed(() => !props.hideLink && props.action.actor === 'CLIENT');
</script>

<template>
  <DsCard :accent="action.actor === 'CLIENT'">
    <div class="gks-next">
      <div class="gks-next__icon" :class="`gks-next__icon--${action.actor.toLowerCase()}`">
        <DsIcon :name="ACTOR_ICON[action.actor]" :size="20" />
      </div>
      <div class="gks-next__text">
        <span class="gks-eyebrow">{{ ACTOR_LABEL[action.actor] }}</span>
        <p class="gks-next__label">{{ action.label }}</p>
        <p class="gks-next__desc">{{ action.description }}</p>
      </div>
      <DsButton v-if="showLink" variant="accent" icon-right="arrow-right" class="gks-next__cta" @click="navigateTo(to)">
        Үргэлжлүүлэх
      </DsButton>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-next { display: flex; align-items: flex-start; gap: var(--sp-4); }
.gks-next__icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
  color: var(--text-muted);
}
.gks-next__icon--client { background: var(--surface-selected); color: var(--brand-700); }
.gks-next__icon--none { background: var(--success-bg); color: var(--success-fg); }

.gks-next__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-next__label { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-next__desc { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-next__cta { flex: none; align-self: center; }

@media (max-width: 700px) {
  .gks-next { flex-wrap: wrap; }
  .gks-next__cta { width: 100%; }
}
</style>
