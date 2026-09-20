<script setup lang="ts">
import type { EssayQuestionnaireView, RecommendationListView } from '@gks/shared';

/**
 * The way into the two GKS questionnaires from the case's "Материал" tab
 * (1D-27). Each card says where that questionnaire stands and the one thing to
 * do next — the questionnaires themselves open on their own pages.
 */
const props = defineProps<{ caseId: string }>();

const api = useApi();
const essay = ref<EssayQuestionnaireView | null>(null);
const recs = ref<RecommendationListView | null>(null);

onMounted(async () => {
  const [essayView, recView] = await Promise.allSettled([
    api.get<EssayQuestionnaireView>(`/cases/${props.caseId}/essay`),
    api.get<RecommendationListView>(`/cases/${props.caseId}/recommendations`),
  ]);
  if (essayView.status === 'fulfilled') essay.value = essayView.value;
  if (recView.status === 'fulfilled') recs.value = recView.value;
});

const essayPercent = computed(() => {
  const progress = essay.value?.progress;
  return progress?.total ? Math.round((progress.answered / progress.total) * 100) : 0;
});
const essaySubmitted = computed(() => essay.value?.questionnaire?.status === 'SUBMITTED');
const essayReopened = computed(() => Boolean(essay.value?.questionnaire?.reopenNote) && !essaySubmitted.value);

const recsAnswered = computed(() => recs.value?.items.filter((item) => item.status !== 'INVITED').length ?? 0);
const recsNeeded = computed(() => recs.value?.lettersNeeded ?? null);
const lettersToSign = computed(() => recs.value?.items.filter((item) => item.status === 'LETTER_READY').length ?? 0);
</script>

<template>
  <section class="gks-gksq" aria-label="GKS эссэ ба тодорхойлолт">
    <NuxtLink :to="`/app/essay/${caseId}`" class="gks-gksq__card" :class="{ 'gks-gksq__card--attn': essayReopened }">
      <span class="gks-gksq__icon"><DsIcon name="notebook-pen" :size="22" /></span>
      <span class="gks-gksq__text">
        <span class="gks-gksq__title">Эссэ бэлтгэх асуулга</span>
        <span class="gks-gksq__sub">Personal Statement ба Study Plan-д зориулсан таны түүх</span>
        <span v-if="essaySubmitted" class="gks-gksq__state gks-gksq__state--ok">
          <DsIcon name="circle-check" :size="14" /> Мэргэжилтэнд илгээсэн
        </span>
        <span v-else-if="essayReopened" class="gks-gksq__state gks-gksq__state--warn">
          <DsIcon name="message-square-warning" :size="14" /> Мэргэжилтэн нэмэлт мэдээлэл хүссэн
        </span>
        <span v-else-if="essay?.progress?.answered" class="gks-gksq__state">
          <span class="gks-gksq__bar"><span :style="{ width: `${essayPercent}%` }" /></span>
          {{ essayPercent }}% бөглөсөн
        </span>
        <span v-else class="gks-gksq__state">~1.5 цаг · хэд хуваагаад бөглөж болно</span>
      </span>
      <span class="gks-gksq__cta">
        {{ essaySubmitted ? 'Харах' : essay?.progress?.answered ? 'Үргэлжлүүлэх' : 'Эхлэх' }}
        <DsIcon name="arrow-right" :size="16" />
      </span>
    </NuxtLink>

    <NuxtLink :to="`/app/recommenders/${caseId}`" class="gks-gksq__card" :class="{ 'gks-gksq__card--attn': lettersToSign }">
      <span class="gks-gksq__icon"><DsIcon name="signature" :size="22" /></span>
      <span class="gks-gksq__text">
        <span class="gks-gksq__title">Багшийн тодорхойлолт</span>
        <span class="gks-gksq__sub">Багш тань холбоосоор монголоор хариулна, англиар бид бэлтгэнэ</span>
        <span v-if="lettersToSign" class="gks-gksq__state gks-gksq__state--warn">
          <DsIcon name="printer" :size="14" /> {{ lettersToSign }} тодорхойлолтод гарын үсэг зуруулах
        </span>
        <span v-else-if="recs?.items.length" class="gks-gksq__state">
          {{ recsAnswered }}/{{ Math.max(recsNeeded ?? 0, recs.items.length) }} багш хариулсан
        </span>
        <span v-else class="gks-gksq__state">
          {{ recsNeeded ? `${recsNeeded} багшаас хүснэ` : 'Багшаа нэмж, холбоос илгээнэ' }}
        </span>
      </span>
      <span class="gks-gksq__cta">
        {{ recs?.items.length ? 'Нээх' : 'Багш нэмэх' }}
        <DsIcon name="arrow-right" :size="16" />
      </span>
    </NuxtLink>
  </section>
</template>

<style scoped>
.gks-gksq { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-gksq__card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  gap: var(--sp-3) var(--sp-4);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  text-decoration: none;
  color: inherit;
  transition: var(--transition-control);
}
.gks-gksq__card:hover { border-color: var(--brand-400); box-shadow: var(--shadow-card); }
.gks-gksq__card--attn { border-color: var(--amber-600); box-shadow: 0 0 0 3px var(--amber-050); }
.gks-gksq__icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-2); background: var(--brand-050); color: var(--brand-700); grid-row: 1 / span 2; }
.gks-gksq__text { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-gksq__title { font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-gksq__sub { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-gksq__state { display: inline-flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-body); }
.gks-gksq__state--ok { color: var(--success-fg); font-weight: var(--fw-semibold); }
.gks-gksq__state--warn { color: var(--warning-fg); font-weight: var(--fw-semibold); }
.gks-gksq__bar { width: 80px; height: 4px; border-radius: var(--radius-pill); background: var(--n-100); overflow: hidden; }
.gks-gksq__bar span { display: block; height: 100%; background: var(--brand-600); }
.gks-gksq__cta { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--brand-700); }
@media (max-width: 760px) {
  .gks-gksq { grid-template-columns: minmax(0, 1fr); }
}
</style>
