<script setup lang="ts">
import type { CaseListItem, CaseStage } from '@gks/shared';

/** The logged-in user's own cases (1C-17). */
definePageMeta({ middleware: 'auth' });

const api = useApi();
const cases = ref<CaseListItem[]>([]);
const pending = ref(true);
const errored = ref(false);

onMounted(async () => {
  try {
    cases.value = await api.get<CaseListItem[]>('/cases/mine');
  } catch {
    errored.value = true;
  } finally {
    pending.value = false;
  }
});

function stageTone(s: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'COMPLETED') return 'success';
  if (['CANCELLED', 'REJECTED'].includes(s)) return 'danger';
  if (s === 'ON_HOLD') return 'warning';
  if (s === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}

useHead({ title: 'Миний хэрэг' });
</script>

<template>
  <div class="gks-cases">
    <h1 class="gks-cases__title">Миний хэрэг</h1>

    <DsCard v-if="errored" accent><p>Жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending" class="gks-cases__skeleton" />
    <DsCard v-else-if="!cases.length" padding="var(--sp-8)">
      <p class="gks-cases__empty">Танд одоогоор нээлттэй хэрэг алга байна. Зөвлөхтэйгээ холбогдоно уу.</p>
    </DsCard>

    <div v-else class="gks-cases__list">
      <NuxtLink v-for="c in cases" :key="c.id" :to="`/app/cases/${c.id}`" class="gks-cases__item">
        <DsCard>
          <div class="gks-cases__row">
            <div>
              <p class="gks-cases__code gks-tnum">{{ c.code }}</p>
              <p class="gks-cases__service">{{ SERVICE_LABELS[c.serviceType] }} · {{ c.university?.nameMn ?? 'Сургууль сонгоогүй' }}</p>
            </div>
            <DsBadge :tone="stageTone(c.stage)">{{ CASE_STAGE_LABELS[c.stage] }}</DsBadge>
          </div>
        </DsCard>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.gks-cases { display: flex; flex-direction: column; gap: var(--sp-5); max-width: var(--container-content); margin: 0 auto; padding: var(--sp-6); }
.gks-cases__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-cases__skeleton { height: 120px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-cases__empty { text-align: center; color: var(--text-muted); }
.gks-cases__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-cases__item { text-decoration: none; color: inherit; }
.gks-cases__row { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-4); }
.gks-cases__code { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-cases__service { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>
