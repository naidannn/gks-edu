<script setup lang="ts">
import type { EssayQuestionnaireView, RecommendationItem, RecommendationListView } from '@gks/shared';

/**
 * The writer's desk for one GKS case (1D-27): the client's essay answers and
 * every teacher's answers, laid out to be read, copied into a draft, printed —
 * and the few moves staff make on them: send the essay back with a note,
 * attach the English letter, mark the signed envelope received.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const router = useRouter();
const api = useApi();
const config = useRuntimeConfig();
const caseId = computed(() => String(route.params.caseId));

type Tab = 'essay' | 'letters';
const tab = computed<Tab>(() => (route.query.tab === 'letters' ? 'letters' : 'essay'));
const openTab = (next: Tab) => router.replace({ query: { ...route.query, tab: next === 'essay' ? undefined : next } });

const essay = ref<EssayQuestionnaireView | null>(null);
const recs = ref<RecommendationListView | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref<string | null>(null);

async function load() {
  try {
    const [essayView, recView] = await Promise.all([
      api.get<EssayQuestionnaireView>(`/cases/${caseId.value}/essay`),
      api.get<RecommendationListView>(`/cases/${caseId.value}/recommendations`),
    ]);
    essay.value = essayView;
    recs.value = recView;
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Асуулгыг ачаалж чадсангүй');
  }
}
onMounted(load);

async function run(key: string, action: () => Promise<unknown>, done?: string) {
  busy.value = key;
  actionError.value = null;
  notice.value = null;
  try {
    await action();
    if (done) notice.value = done;
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = null;
  }
}

async function copyText(path: string, key: string) {
  await run(
    key,
    async () => {
      const text = await api.get<string>(path, { responseType: 'text' });
      await navigator.clipboard.writeText(text);
    },
    'Хуулагдлаа — ноорог руугаа буулгана уу.',
  );
}

// ── Essay ─────────────────────────────────────────────────────────────────
const reopening = ref(false);
const reopenNote = ref('');
async function reopen() {
  if (!reopenNote.value.trim()) return;
  await run('reopen', async () => {
    essay.value = await api.post<EssayQuestionnaireView>(`/cases/${caseId.value}/essay/reopen`, { note: reopenNote.value });
    reopening.value = false;
    reopenNote.value = '';
  }, 'Үйлчлүүлэгчид буцааж нээлээ — тэмдэглэл нь асуулгын дээр харагдана.');
}

// ── Letters ───────────────────────────────────────────────────────────────
const notes = reactive<Record<string, string>>({});
const linkFor = (item: RecommendationItem) => recommendationLink(window.location.origin, item.token);

async function setStatus(item: RecommendationItem, status: RecommendationItem['status'], done: string) {
  await run(`${item.id}:${status}`, async () => {
    await api.post(`/cases/${caseId.value}/recommendations/${item.id}/status`, {
      status,
      staffNote: notes[item.id] ?? item.staffNote ?? undefined,
    });
    await load();
  }, done);
}

async function attach(item: RecommendationItem, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  await run(`${item.id}:letter`, async () => {
    const body = new FormData();
    body.append('file', file);
    await api.post(`/cases/${caseId.value}/recommendations/${item.id}/letter`, body);
    if (notes[item.id] !== undefined) {
      await api.post(`/cases/${caseId.value}/recommendations/${item.id}/status`, { status: 'LETTER_READY', staffNote: notes[item.id] });
    }
    await load();
  }, 'Англи хувилбар хавсаргагдлаа — үйлчлүүлэгч кабинетаасаа татаж хэвлэнэ.');
}

async function openLetter(item: RecommendationItem) {
  await run(`${item.id}:open`, async () => {
    const signed = await api.get<{ token: string }>(`/cases/${caseId.value}/recommendations/${item.id}/letter`);
    window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
  });
}

async function copyLink(item: RecommendationItem) {
  await run(`${item.id}:link`, () => navigator.clipboard.writeText(linkFor(item)), 'Багшийн холбоос хуулагдлаа.');
}

const recommenderRows = (item: RecommendationItem) => {
  const fields = recs.value?.definitions[item.level]?.recommenderFields ?? [];
  return fields.map((field) => ({ label: field.label, value: item.recommender?.[field.id] ?? '' }));
};

function printAnswers() {
  window.print();
}

useHead({ title: 'GKS асуулга · CRM' });
</script>

<template>
  <div class="gks-page gks-qadmin">
    <NuxtLink :to="`/admin/cases/${caseId}`" class="gks-qadmin__back gks-no-print">
      <DsIcon name="arrow-left" :size="16" /> Үйлчлүүлэгчийн ажлын талбар
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="!essay || !recs" class="gks-skeleton__row gks-skeleton--page" />

    <template v-else>
      <header class="gks-qadmin__head">
        <div>
          <p class="gks-eyebrow">GKS асуулга<template v-if="essay.level"> · {{ QUESTIONNAIRE_LEVEL_LABELS[essay.level] }}</template></p>
          <h1 class="gks-qadmin__h1">{{ essay.applicantName }}</h1>
        </div>
      </header>

      <nav class="gks-tabs gks-no-print" aria-label="Асуулга">
        <button type="button" class="gks-tab" :class="{ 'gks-tab--active': tab === 'essay' }" @click="openTab('essay')">
          <DsIcon name="notebook-pen" :size="16" /><span>Эссэ</span>
        </button>
        <button type="button" class="gks-tab" :class="{ 'gks-tab--active': tab === 'letters' }" @click="openTab('letters')">
          <DsIcon name="signature" :size="16" /><span>Багшийн тодорхойлолт</span>
          <span v-if="recs.items.length" class="gks-tab__count gks-tnum">{{ recs.items.length }}</span>
        </button>
      </nav>

      <p v-if="actionError" class="gks-qadmin__error gks-no-print">{{ actionError }}</p>
      <p v-if="notice" class="gks-qadmin__notice gks-no-print"><DsIcon name="check" :size="14" /> {{ notice }}</p>

      <!-- ── Essay ─────────────────────────────────────────────── -->
      <template v-if="tab === 'essay'">
        <DsCard v-if="!essay.questionnaire || !essay.definition" padding="var(--sp-8)">
          <p class="gks-qadmin__empty">Үйлчлүүлэгч эссэний асуулгаа хараахан эхлээгүй байна.</p>
        </DsCard>

        <template v-else>
          <DsCard>
            <div class="gks-qadmin__status">
              <DsBadge :tone="essay.questionnaire.status === 'SUBMITTED' ? 'success' : 'info'">
                {{ ESSAY_STATUS_LABELS[essay.questionnaire.status] }}
              </DsBadge>
              <span class="gks-qadmin__meta gks-tnum">
                {{ essay.progress?.answered }}/{{ essay.progress?.total }} асуулт хариулсан
                <template v-if="essay.questionnaire.submittedAt"> · {{ formatDateTime(essay.questionnaire.submittedAt) }}-нд илгээсэн</template>
                <template v-else> · сүүлд {{ formatDateTime(essay.questionnaire.updatedAt) }}</template>
              </span>
              <span class="gks-qadmin__actions gks-no-print">
                <DsButton size="sm" variant="primary" icon-left="copy" :loading="busy === 'essay-copy'" @click="copyText(`/cases/${caseId}/essay/text`, 'essay-copy')">
                  Бүгдийг хуулах
                </DsButton>
                <DsButton size="sm" variant="secondary" icon-left="printer" @click="printAnswers">Хэвлэх</DsButton>
                <DsButton
                  v-if="essay.questionnaire.status === 'SUBMITTED'"
                  size="sm"
                  variant="ghost"
                  icon-left="undo-2"
                  @click="reopening = !reopening"
                >
                  Буцааж нээх
                </DsButton>
              </span>
            </div>

            <form v-if="reopening" class="gks-qadmin__reopen gks-no-print" @submit.prevent="reopen">
              <DsTextarea
                v-model="reopenNote"
                label="Үйлчлүүлэгчид юуг нэмж, засахыг хэлэх вэ?"
                :rows="3"
                placeholder="Жишээ: Ажлын туршлагаа дэлгэрэнгүй бичээрэй — хаана, хэдий хугацаанд, ямар үүрэгтэй ажилласан бэ."
              />
              <div class="gks-qadmin__reopen-actions">
                <DsButton variant="ghost" @click="reopening = false">Болих</DsButton>
                <DsButton type="submit" variant="accent" :loading="busy === 'reopen'" :disabled="!reopenNote.trim()">Буцааж нээх</DsButton>
              </div>
            </form>
            <p v-if="essay.questionnaire.reopenNote && essay.questionnaire.status === 'DRAFT'" class="gks-qadmin__meta">
              Буцааж нээсэн тэмдэглэл: «{{ essay.questionnaire.reopenNote }}»
            </p>
          </DsCard>

          <DsCard padding="var(--sp-6)">
            <QuestionnaireAnswerList :definition="essay.definition" :answers="essay.questionnaire.answers" />
          </DsCard>
        </template>
      </template>

      <!-- ── Letters ───────────────────────────────────────────── -->
      <template v-else>
        <DsCard v-if="!recs.items.length" padding="var(--sp-8)">
          <p class="gks-qadmin__empty">
            Үйлчлүүлэгч тодорхойлолт хүсэх багшаа хараахан нэмээгүй байна.
            <template v-if="recs.lettersNeeded">Энэ түвшинд {{ recs.lettersNeeded }} тодорхойлолт хэрэгтэй.</template>
          </p>
        </DsCard>

        <DsCard v-for="item in recs.items" :key="item.id" padding="var(--sp-6)">
          <div class="gks-qadmin__rec-head">
            <div>
              <h2 class="gks-qadmin__rec-name">{{ item.recommenderName }}</h2>
              <p class="gks-qadmin__meta">
                <template v-if="item.relation">{{ item.relation }} · </template>
                {{ item.filledByApplicant ? 'Үйлчлүүлэгч багшаас асууж бөглөсөн' : 'Багш холбоосоор бөглөсөн' }}
                <template v-if="item.answeredAt"> · {{ formatDateTime(item.answeredAt) }}</template>
              </p>
            </div>
            <DsBadge :tone="RECOMMENDATION_STATUS_TONES[item.status]">{{ RECOMMENDATION_STATUS_STAFF_LABELS[item.status] }}</DsBadge>
          </div>

          <div v-if="item.status === 'INVITED'" class="gks-qadmin__waiting gks-no-print">
            <DsIcon :name="item.openedAt ? 'eye' : 'hourglass'" :size="16" />
            <span>
              {{ item.openedAt ? `Багш ${formatDayMonth(item.openedAt)}-нд холбоосыг нээсэн` : 'Багш холбоосыг хараахан нээгээгүй' }}
              · {{ item.progress.answered }}/{{ item.progress.total }} асуулт
            </span>
            <DsButton size="sm" variant="ghost" icon-left="link" @click="copyLink(item)">Холбоос хуулах</DsButton>
          </div>

          <template v-else>
            <dl class="gks-qadmin__who">
              <div v-for="row in recommenderRows(item)" :key="row.label">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value || '—' }}</dd>
              </div>
            </dl>

            <details class="gks-qadmin__answers" open>
              <summary>Багшийн хариулт</summary>
              <QuestionnaireAnswerList
                v-if="recs.definitions[item.level] && item.answers"
                :definition="recs.definitions[item.level]!"
                :answers="item.answers"
              />
            </details>

            <div class="gks-qadmin__workflow gks-no-print">
              <DsButton size="sm" variant="primary" icon-left="copy" :loading="busy === `${item.id}:copy`" @click="copyText(`/cases/${caseId}/recommendations/${item.id}/text`, `${item.id}:copy`)">
                Хариултыг хуулах
              </DsButton>

              <DsInput
                v-model="notes[item.id]"
                class="gks-qadmin__note"
                label="Үйлчлүүлэгчид харагдах тэмдэглэл"
                :placeholder="item.staffNote ?? 'Жишээ: 10-р сарын 5-наас өмнө оффист авчраарай'"
              />

              <label class="gks-qadmin__upload">
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" hidden @change="attach(item, $event)">
                <span class="gks-qadmin__upload-btn">
                  <DsIcon :name="busy === `${item.id}:letter` ? 'loader-circle' : 'upload'" :size="16" />
                  {{ item.hasLetter ? 'Англи хувилбарыг солих' : 'Англи хувилбар хавсаргах (PDF)' }}
                </span>
              </label>
              <DsButton v-if="item.hasLetter" size="sm" variant="ghost" icon-left="file-text" @click="openLetter(item)">
                {{ item.letterName ?? 'Хавсралт' }}
              </DsButton>

              <DsButton
                v-if="item.status !== 'RECEIVED'"
                size="sm"
                variant="accent"
                icon-left="mail-check"
                :loading="busy === `${item.id}:RECEIVED`"
                @click="setStatus(item, 'RECEIVED', 'Эх хувь хүлээн авсан гэж тэмдэглэлээ.')"
              >
                Эх хувь ирсэн (дугтуйг шалгаж битүүмжилсэн)
              </DsButton>
              <DsButton
                size="sm"
                variant="ghost"
                icon-left="undo-2"
                :loading="busy === `${item.id}:INVITED`"
                @click="setStatus(item, 'INVITED', 'Багшид буцааж нээлээ — холбоосоор дахин засах боломжтой.')"
              >
                Багшид засуулахаар буцаах
              </DsButton>
            </div>
          </template>
        </DsCard>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-qadmin { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 1100px; }
.gks-qadmin__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-qadmin__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-qadmin__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-qadmin__notice { display: flex; align-items: center; gap: var(--sp-2); color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-qadmin__empty { color: var(--text-subtle); font-style: italic; }
.gks-qadmin__status { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.gks-qadmin__meta { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-qadmin__actions { display: flex; gap: var(--sp-2); margin-left: auto; flex-wrap: wrap; }
.gks-qadmin__reopen { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-4); }
.gks-qadmin__reopen-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }

.gks-qadmin__rec-head { display: flex; justify-content: space-between; gap: var(--sp-3); align-items: flex-start; margin-bottom: var(--sp-4); }
.gks-qadmin__rec-name { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-qadmin__waiting { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-qadmin__who { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--sp-3) var(--sp-5); margin-bottom: var(--sp-5); padding: var(--sp-4); border-radius: var(--radius-2); background: var(--surface-sunken); }
.gks-qadmin__who dt { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-qadmin__who dd { font-size: var(--fs-body-sm); color: var(--text-strong); font-weight: var(--fw-medium); word-break: break-word; }
.gks-qadmin__answers { margin-bottom: var(--sp-5); }
.gks-qadmin__answers summary { cursor: pointer; font-weight: var(--fw-semibold); color: var(--brand-700); margin-bottom: var(--sp-4); }
.gks-qadmin__workflow { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-qadmin__note { flex: 1 1 280px; }
.gks-qadmin__upload { cursor: pointer; }
.gks-qadmin__upload-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--control-sm);
  padding: 0 var(--sp-3);
  border: var(--border-hair) dashed var(--brand-400);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--brand-700);
  background: var(--brand-025);
}
.gks-qadmin__upload-btn:hover { background: var(--brand-050); }

@media print {
  .gks-no-print { display: none !important; }
}
</style>
