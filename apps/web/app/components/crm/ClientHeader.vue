<script setup lang="ts">
import type { ClientDetail, WorkspaceCase } from '@gks/shared';

/**
 * The workspace header (1G-17): who this is, which service cycle is in view,
 * where it has got to and who is responsible — the five facts an admin needs
 * before doing anything else on the page.
 */
const props = defineProps<{
  client: ClientDetail;
  activeCase: WorkspaceCase | null;
  cases: WorkspaceCase[];
}>();

const emit = defineEmits<{ 'select-case': [id: string]; edit: [] }>();

const fullName = computed(() => `${props.client.lastName} ${props.client.firstName}`);
const consultant = computed(
  () =>
    props.activeCase?.assignedConsultant?.name
    ?? props.client.assignedConsultant?.name
    ?? props.client.assignedConsultant?.email
    ?? 'Хариуцагчгүй',
);
const target = computed(() => {
  const university = universityName(props.activeCase?.university ?? props.client.targetUniversity, '');
  const major = props.client.targetMajor;
  return [university, major].filter(Boolean).join(' · ') || null;
});
</script>

<template>
  <header class="gks-clienthead">
    <div class="gks-clienthead__top">
      <div class="gks-clienthead__id">
        <NuxtLink to="/admin/clients" class="gks-clienthead__back">
          <DsIcon name="arrow-left" :size="16" /> Үйлчлүүлэгчид
        </NuxtLink>
        <h1 class="gks-clienthead__name">{{ fullName }}</h1>
        <div class="gks-clienthead__badges">
          <span class="gks-clienthead__code gks-tnum">{{ client.code }}</span>
          <DsBadge :tone="CLIENT_STATUS_TONE[client.status]">{{ CLIENT_STATUS_LABELS[client.status] }}</DsBadge>
          <DsBadge v-if="client.isMinor" tone="warning" icon="triangle-alert">18 нас хүрээгүй</DsBadge>
          <a :href="`tel:${client.phone}`" class="gks-clienthead__phone gks-tnum">
            <DsIcon name="phone" :size="14" /> {{ client.phone }}
          </a>
        </div>
      </div>

      <div class="gks-clienthead__actions">
        <DsButton variant="secondary" size="sm" icon-left="pencil" @click="emit('edit')">Мэдээлэл засах</DsButton>
      </div>
    </div>

    <!-- One line of service state; the tabs below act on the case named here. -->
    <div v-if="activeCase" class="gks-clienthead__state">
      <div class="gks-clienthead__facts">
        <span class="gks-clienthead__service">{{ SERVICE_LABELS[activeCase.serviceType] }}</span>
        <DsBadge :tone="CASE_STAGE_TONE[activeCase.stage]">{{ CASE_STAGE_LABELS[activeCase.stage] }}</DsBadge>
        <span v-if="target" class="gks-clienthead__target">{{ target }}</span>
        <span class="gks-clienthead__consultant"><DsIcon name="user-check" :size="14" /> {{ consultant }}</span>
      </div>

      <div class="gks-clienthead__progress">
        <div class="gks-clienthead__track">
          <span class="gks-clienthead__fill" :style="{ width: `${activeCase.progressPercent}%` }" />
        </div>
        <span class="gks-clienthead__percent gks-tnum">{{ activeCase.progressPercent }}%</span>
      </div>
    </div>

    <p v-else class="gks-clienthead__nocase">Энэ үйлчлүүлэгч дээр үйлчилгээ эхлээгүй байна.</p>

    <!-- A returning client runs several cycles; the picker only appears then. -->
    <div v-if="cases.length > 1" class="gks-clienthead__cases">
      <DsTag
        v-for="row in cases"
        :key="row.id"
        clickable
        :selected="row.id === activeCase?.id"
        @click="emit('select-case', row.id)"
      >
        {{ row.code }} · {{ SERVICE_LABELS[row.serviceType] }}
      </DsTag>
    </div>
  </header>
</template>

<style scoped>
.gks-clienthead { display: flex; flex-direction: column; gap: var(--sp-4); }

.gks-clienthead__top { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.gks-clienthead__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-subtle); text-decoration: none; }
.gks-clienthead__back:hover { color: var(--brand-600); }
.gks-clienthead__name { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-clienthead__badges { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); flex-wrap: wrap; }
.gks-clienthead__code { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-clienthead__phone { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; }
.gks-clienthead__phone:hover { color: var(--brand-600); }
.gks-clienthead__actions { display: flex; gap: var(--sp-2); }

.gks-clienthead__state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  flex-wrap: wrap;
  padding: var(--sp-3) var(--sp-4);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
}
.gks-clienthead__facts { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; font-size: var(--fs-body-sm); }
.gks-clienthead__service { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-clienthead__target, .gks-clienthead__consultant { display: inline-flex; align-items: center; gap: var(--sp-1); color: var(--text-muted); }

.gks-clienthead__progress { display: flex; align-items: center; gap: var(--sp-3); min-width: 200px; flex: 1; max-width: 320px; }
.gks-clienthead__track { flex: 1; height: 6px; border-radius: var(--radius-pill); background: var(--n-100); overflow: hidden; }
.gks-clienthead__fill { display: block; height: 100%; background: var(--brand-600); }
.gks-clienthead__percent { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-muted); }

.gks-clienthead__nocase { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-clienthead__cases { display: flex; gap: var(--sp-2); flex-wrap: wrap; }

@media (max-width: 700px) {
  .gks-clienthead__progress { max-width: none; }
}
</style>
