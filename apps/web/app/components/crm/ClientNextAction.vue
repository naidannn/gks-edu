<script setup lang="ts">
import type { WorkspaceCase } from '@gks/shared';

/**
 * "Дараа нь юу хийх вэ?" for staff (1G-17).
 *
 * The sentence is the server's — the same `nextAction` the client reads in
 * their portal — so the office never tells someone something different from
 * what their own dashboard says. The button jumps to the tab that resolves it.
 */
const props = defineProps<{ workspaceCase: WorkspaceCase }>();
const emit = defineEmits<{ open: [tab: 'overview' | 'process' | 'documents' | 'payments' | 'activity'] }>();

const ACTOR_LABEL = {
  CLIENT: 'Үйлчлүүлэгчийн талд',
  STAFF: 'Бидний талд',
  SCHOOL: 'Сургуулийн талд',
  NONE: 'Мэдээлэл',
} as const;

const ACTOR_ICON = {
  CLIENT: 'user',
  STAFF: 'circle-arrow-right',
  SCHOOL: 'graduation-cap',
  NONE: 'circle-check',
} as const;

/** The portal's tab names map onto the workspace's five. */
const TAB_FOR = {
  overview: 'overview',
  contract: 'payments',
  payment: 'payments',
  documents: 'documents',
  application: 'process',
  visa: 'process',
  departure: 'process',
} as const;

const action = computed(() => props.workspaceCase.nextAction);
const targetTab = computed(() => TAB_FOR[action.value.tab]);
/** Staff act on everything except what only the client or the school can do. */
const isOurs = computed(() => action.value.actor === 'STAFF');
</script>

<template>
  <DsCard :accent="isOurs">
    <div class="gks-nextact">
      <div class="gks-nextact__icon" :class="`gks-nextact__icon--${action.actor.toLowerCase()}`">
        <DsIcon :name="ACTOR_ICON[action.actor]" :size="20" />
      </div>
      <div class="gks-nextact__text">
        <span class="gks-eyebrow">Дараагийн алхам · {{ ACTOR_LABEL[action.actor] }}</span>
        <p class="gks-nextact__label">{{ action.label }}</p>
        <p class="gks-nextact__desc">{{ action.description }}</p>
      </div>
      <DsButton
        v-if="targetTab !== 'overview'"
        variant="secondary"
        size="sm"
        icon-right="arrow-right"
        class="gks-nextact__cta"
        @click="emit('open', targetTab)"
      >
        Очих
      </DsButton>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-nextact { display: flex; align-items: flex-start; gap: var(--sp-4); }
.gks-nextact__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-2);
  background: var(--n-100);
  color: var(--text-muted);
}
.gks-nextact__icon--staff { background: var(--danger-bg); color: var(--danger-fg); }
.gks-nextact__icon--client { background: var(--info-bg); color: var(--info-fg); }
.gks-nextact__icon--school { background: var(--warning-bg); color: var(--warning-fg); }
.gks-nextact__icon--none { background: var(--success-bg); color: var(--success-fg); }

.gks-nextact__text { flex: 1; min-width: 0; }
.gks-nextact__label { margin-top: 2px; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-nextact__desc { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-nextact__cta { flex: none; }

@media (max-width: 640px) {
  .gks-nextact { flex-wrap: wrap; }
  .gks-nextact__cta { width: 100%; }
}
</style>
