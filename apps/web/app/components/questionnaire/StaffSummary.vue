<script setup lang="ts">
import type { EssayQuestionnaireView, RecommendationListView } from '@gks/shared';

/**
 * One line each for the essay and the teachers' letters, on the client
 * workspace's documents tab (1D-27) — enough for staff to see whether there is
 * anything to read, with the reading itself on `/admin/questionnaires/:caseId`.
 */
const props = defineProps<{ caseId: string }>();

const api = useApi();
const essay = ref<EssayQuestionnaireView | null>(null);
const recs = ref<RecommendationListView | null>(null);

async function load() {
  const [essayView, recView] = await Promise.allSettled([
    api.get<EssayQuestionnaireView>(`/cases/${props.caseId}/essay`),
    api.get<RecommendationListView>(`/cases/${props.caseId}/recommendations`),
  ]);
  essay.value = essayView.status === 'fulfilled' ? essayView.value : null;
  recs.value = recView.status === 'fulfilled' ? recView.value : null;
}
onMounted(load);
watch(() => props.caseId, load);

const essayLine = computed(() => {
  const view = essay.value;
  if (!view?.questionnaire) return 'Эхлээгүй';
  const progress = view.progress;
  const count = progress ? `${progress.answered}/${progress.total} асуулт` : '';
  if (view.questionnaire.status === 'SUBMITTED') return `Илгээсэн · ${count}`;
  return `Бөглөж байна · ${count}`;
});
</script>

<template>
  <DsCard eyebrow="GKS" title="Эссэ ба багшийн тодорхойлолт">
    <template #action>
      <NuxtLink :to="`/admin/questionnaires/${caseId}`" class="gks-qsum__open">Хариултыг унших →</NuxtLink>
    </template>
    <div class="gks-qsum">
      <div class="gks-qsum__row">
        <DsIcon name="notebook-pen" :size="18" />
        <span class="gks-qsum__label">Эссэ<template v-if="essay?.level"> · {{ QUESTIONNAIRE_LEVEL_LABELS[essay.level] }}</template></span>
        <DsBadge :tone="essay?.questionnaire?.status === 'SUBMITTED' ? 'success' : essay?.questionnaire ? 'info' : 'neutral'">
          {{ essayLine }}
        </DsBadge>
      </div>
      <div class="gks-qsum__row">
        <DsIcon name="signature" :size="18" />
        <span class="gks-qsum__label">
          Тодорхойлолт<template v-if="recs?.lettersNeeded"> · {{ recs.lettersNeeded }} хэрэгтэй</template>
        </span>
        <span v-if="!recs?.items.length" class="gks-qsum__none">Багш нэмээгүй</span>
        <span v-else class="gks-qsum__badges">
          <DsBadge v-for="item in recs.items" :key="item.id" :tone="RECOMMENDATION_STATUS_TONES[item.status]">
            {{ item.recommenderName }}: {{ RECOMMENDATION_STATUS_STAFF_LABELS[item.status] }}
          </DsBadge>
        </span>
      </div>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-qsum { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-qsum__row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; font-size: var(--fs-body-sm); }
.gks-qsum__row > :first-child { color: var(--brand-600); }
.gks-qsum__label { font-weight: var(--fw-semibold); color: var(--text-strong); min-width: 180px; }
.gks-qsum__badges { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-qsum__none { color: var(--text-subtle); font-style: italic; }
.gks-qsum__open { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--brand-700); text-decoration: none; }
</style>
