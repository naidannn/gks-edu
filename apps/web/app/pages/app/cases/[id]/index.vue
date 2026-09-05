<script setup lang="ts">
import type { PortalCaseDetail, CaseTransitionItem } from '@gks/shared';

/** Case overview: the next step, the paperwork, the money and the history (1G-15). */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const { gksCase } = inject('caseDetail') as { gksCase: Ref<PortalCaseDetail | null>; reload: () => Promise<void> };

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('mn-MN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function transitionLabel(transition: CaseTransitionItem): string {
  return `${CASE_STAGE_LABELS[transition.fromStage]} → ${CASE_STAGE_LABELS[transition.toStage]}`;
}

const admission = computed(() => gksCase.value?.documents.admission ?? null);
const intake = computed(() => gksCase.value?.intake ?? null);

/** `null` is "мэдээлэл шинэчлэгдэж байна", never a guessed date. */
function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function countdownLabel(days: number | null): string {
  if (days === null) return 'Хугацаа тодорхойгүй';
  if (days < 0) return `Хугацаа ${Math.abs(days)} хоногоор хэтэрсэн`;
  if (days === 0) return 'Өнөөдөр хаагдана';
  return `${days} хоног үлдлээ`;
}

function countdownTone(days: number | null): BadgeTone {
  if (days === null) return 'neutral';
  if (days < 0) return 'danger';
  if (days <= 7) return 'danger';
  if (days <= 21) return 'warning';
  return 'success';
}
const payments = computed(() => (gksCase.value?.payments ?? []).filter((p) => p.kind === 'PREPAYMENT' || p.kind === 'BALANCE'));
const consultant = computed(() => gksCase.value?.assignedConsultant ?? null);
</script>

<template>
  <div v-if="gksCase" class="gks-overview">
    <PortalNextActionCard :action="gksCase.nextAction" :case-id="gksCase.id" />

    <DsCard v-if="intake" title="Элсэлтийн хугацаа">
      <template #action>
        <DsBadge :tone="countdownTone(intake.daysUntilInternalDeadline)">
          {{ countdownLabel(intake.daysUntilInternalDeadline) }}
        </DsBadge>
      </template>
      <p class="gks-overview__intake-term">
        {{ gksCase.university?.nameMn ?? 'Сургууль сонгоогүй' }} — {{ intake.year }} оны
        {{ INTAKE_MONTH_LABELS[intake.month] ?? `${intake.month}-р сар` }} ·
        {{ PROGRAM_LEVEL_LABELS[intake.level] }}
      </p>
      <dl class="gks-overview__dates">
        <div>
          <dt>Бүртгэлийн эцсийн хугацаа</dt>
          <dd class="gks-tnum gks-overview__dates-ours">{{ formatDate(intake.internalDeadline) }}</dd>
        </div>
        <div>
          <dt>Хичээл эхлэх</dt>
          <dd class="gks-tnum">{{ formatDate(intake.classStartDate) }}</dd>
        </div>
        <div v-if="intake.resultAnnouncedAt">
          <dt>Хариу зарлах</dt>
          <dd class="gks-tnum">{{ formatDate(intake.resultAnnouncedAt) }}</dd>
        </div>
      </dl>
      <p class="gks-overview__meta">
        Энэ огноо хүртэл материалаа бүрэн бүрдүүлсэн байх шаардлагатай. Орчуулга, баталгаажуулалтад
        хугацаа зарцуулагддаг тул эрт эхлэх тусам сайн.
      </p>
      <p v-if="intake.requirementNote" class="gks-overview__meta">{{ intake.requirementNote }}</p>
    </DsCard>

    <div class="gks-overview__cols">
      <DsCard title="Материалын явц">
        <template v-if="admission && admission.requiredTotal > 0">
          <p class="gks-overview__figure gks-tnum">{{ admission.percent }}%</p>
          <div class="gks-overview__bar">
            <div class="gks-overview__fill" :style="{ width: `${admission.percent}%` }" />
          </div>
          <p class="gks-overview__meta gks-tnum">
            Заавал шаардлагатай {{ admission.requiredTotal }}-аас {{ admission.requiredDone }} нь бэлэн
            <span v-if="admission.needsFix"> · {{ admission.needsFix }} засвартай</span>
          </p>
          <NuxtLink :to="`/app/cases/${gksCase.id}/documents`" class="gks-overview__link">Материал руу очих</NuxtLink>
        </template>
        <p v-else class="gks-overview__unknown">
          Материалын жагсаалт нөхцөлийн анкет бөглөсний дараа үүснэ.
        </p>
      </DsCard>

      <DsCard title="Төлбөр">
        <ul v-if="payments.length" class="gks-overview__payments">
          <li v-for="payment in payments" :key="payment.id">
            <span>{{ PAYMENT_KIND_LABELS[payment.kind] }}</span>
            <span class="gks-tnum">{{ formatMntAmount(payment.amountMnt) }}</span>
            <DsBadge :tone="payment.status === 'PAID' ? 'success' : 'warning'">
              {{ PAYMENT_STATUS_LABELS[payment.status] }}
            </DsBadge>
          </li>
        </ul>
        <p v-else class="gks-overview__unknown">Төлбөрийн нэхэмжлэх хараахан үүсээгүй байна.</p>
        <NuxtLink :to="`/app/cases/${gksCase.id}/payment`" class="gks-overview__link">Төлбөр рүү очих</NuxtLink>
      </DsCard>
    </div>

    <DsCard v-if="consultant" title="Таны зөвлөх">
      <p class="gks-overview__consultant">
        <DsIcon name="user-round" :size="16" /> {{ consultant.name ?? 'Хариуцагч томилогдсон' }}
      </p>
      <p class="gks-overview__meta">Асуулт гарвал 7710-9000 дугаараар холбогдоно уу.</p>
    </DsCard>

    <DsCard title="Явцын түүх">
      <ol v-if="gksCase.transitions.length" class="gks-timeline">
        <li v-for="transition in gksCase.transitions" :key="transition.id" class="gks-timeline__item">
          <p class="gks-timeline__stage">{{ transitionLabel(transition) }}</p>
          <p class="gks-timeline__date gks-tnum">{{ formatDateTime(transition.createdAt) }}</p>
        </li>
      </ol>
      <p v-else class="gks-overview__unknown">Явцын түүх хараахан алга байна.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-overview { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-overview__cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-5); }
.gks-overview__unknown { color: var(--text-subtle); font-style: italic; font-size: var(--fs-body-sm); }
.gks-overview__figure { font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-overview__bar { height: 6px; margin: var(--sp-3) 0; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.gks-overview__fill { height: 100%; background: var(--brand-500); }
.gks-overview__meta { font-size: var(--fs-caption); color: var(--text-subtle); line-height: 1.6; }
.gks-overview__meta + .gks-overview__meta { margin-top: var(--sp-2); }
.gks-overview__intake-term { font-weight: var(--fw-semibold); }
.gks-overview__dates { display: grid; gap: var(--sp-2); margin-block: var(--sp-4); padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken, var(--n-050)); }
.gks-overview__dates > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.gks-overview__dates dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-overview__dates dd { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
/* The date the case is driven to. */
.gks-overview__dates-ours { color: var(--brand-700); }
.gks-overview__link { display: inline-block; margin-top: var(--sp-4); font-size: var(--fs-body-sm); color: var(--brand-600); text-decoration: none; }
.gks-overview__link:hover { text-decoration: underline; }

.gks-overview__payments { display: flex; flex-direction: column; gap: var(--sp-3); list-style: none; }
.gks-overview__payments li { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-overview__consultant { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); margin-bottom: var(--sp-2); }

.gks-timeline { display: flex; flex-direction: column; gap: var(--sp-3); list-style: none; }
.gks-timeline__item { padding-bottom: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-timeline__item:last-child { border-bottom: 0; padding-bottom: 0; }
.gks-timeline__stage { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.gks-timeline__date { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }

@media (max-width: 800px) {
  .gks-overview__cols { grid-template-columns: 1fr; }
}
</style>
