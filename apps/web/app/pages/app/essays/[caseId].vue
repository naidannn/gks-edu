<script setup lang="ts">
import type { EssayDocumentKind, EssayDocumentListView, EssayDocumentView } from '@gks/shared';

/**
 * The client reads the Personal Statement and Study Plan the office wrote from
 * their questionnaire (1D-28), says what is wrong by selecting a passage and
 * commenting on it, and approves the essay when it reads right. The text is
 * the office's live copy — a correction shows up here the moment it is saved,
 * with no file to download again.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const router = useRouter();
const api = useApi();
const caseId = computed(() => String(route.params.caseId));

const list = ref<EssayDocumentListView | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = ref<string | null>(null);
const quote = ref('');
const confirming = ref(false);

const kind = computed<EssayDocumentKind>(() => (route.query.kind === 'STUDY_PLAN' ? 'STUDY_PLAN' : 'PERSONAL_STATEMENT'));
function pickKind(next: EssayDocumentKind) {
  quote.value = '';
  confirming.value = false;
  void router.replace({ query: { ...route.query, kind: next === 'PERSONAL_STATEMENT' ? undefined : next } });
}

async function load() {
  try {
    list.value = await api.get<EssayDocumentListView>(`/cases/${caseId.value}/essay/documents`);
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Эссэг ачаалж чадсангүй');
  }
}
onMounted(load);

const current = computed(() => list.value?.documents.find((doc) => doc.kind === kind.value) ?? null);
const readable = computed(() => current.value && current.value.status !== 'DRAFT');

function replaceDocument(next: EssayDocumentView) {
  if (!list.value) return;
  list.value = { ...list.value, documents: list.value.documents.map((doc) => (doc.kind === next.kind ? next : doc)) };
}

async function run(key: string, action: () => Promise<void>) {
  busy.value = key;
  actionError.value = null;
  try {
    await action();
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = null;
  }
}

const addComment = (comment: { body: string; quote: string | null }) =>
  run('comment', async () => {
    replaceDocument(
      await api.post<EssayDocumentView>(`/cases/${caseId.value}/essay/documents/${kind.value}/comments`, {
        body: comment.body,
        quote: comment.quote ?? undefined,
      }),
    );
    quote.value = '';
  });

const approve = () =>
  run('approve', async () => {
    replaceDocument(
      await api.post<EssayDocumentView>(`/cases/${caseId.value}/essay/documents/${kind.value}/status`, { status: 'APPROVED' }),
    );
    confirming.value = false;
  });

function download() {
  if (!current.value || !list.value) return;
  const title = ESSAY_DOCUMENT_KIND_TITLES[kind.value];
  downloadWordDocument(title, current.value.html, essayFileName(list.value.applicantName, title));
}

const openComments = (doc: EssayDocumentView) => doc.comments.filter((comment) => !comment.resolvedAt).length;

useHead({ title: 'Миний эссэ' });
</script>

<template>
  <div class="gks-essays">
    <NuxtLink :to="`/app/cases/${caseId}/documents`" class="gks-essays__back">
      <DsIcon name="arrow-left" :size="16" /> Материал руу буцах
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="!list || !current" class="gks-essays__skeleton" />

    <template v-else>
      <header>
        <p class="gks-eyebrow">GKS тэтгэлэг · Эссэ</p>
        <h1 class="gks-essays__h1">Personal Statement ба Study Plan</h1>
        <p class="gks-essays__lead">
          Таны асуулгын хариултад үндэслэн манай мэргэжилтэн бичсэн. Уншаад засах, нэмэх зүйлээ хэсгийг нь сонгож
          сэтгэгдэл болгон үлдээгээрэй — мэргэжилтэн шууд энд засна.
        </p>
      </header>

      <div class="gks-essays__kinds" role="tablist" aria-label="Эссэ">
        <button
          v-for="doc in list.documents"
          :key="doc.kind"
          type="button"
          role="tab"
          class="gks-essays__kind"
          :class="{ 'gks-essays__kind--on': doc.kind === kind }"
          :aria-selected="doc.kind === kind"
          @click="pickKind(doc.kind)"
        >
          <span class="gks-essays__kind-name">{{ ESSAY_DOCUMENT_KIND_LABELS[doc.kind] }}</span>
          <span class="gks-essays__kind-en">{{ ESSAY_DOCUMENT_KIND_TITLES[doc.kind] }}</span>
          <DsBadge :tone="ESSAY_DOCUMENT_STATUS_TONES[doc.status]">{{ ESSAY_DOCUMENT_STATUS_LABELS[doc.status] }}</DsBadge>
        </button>
      </div>

      <DsCard v-if="!readable" padding="var(--sp-7)">
        <div class="gks-essays__waiting">
          <DsIcon name="pen-line" :size="28" />
          <div>
            <p class="gks-essays__waiting-title">Мэргэжилтэн бичиж байна</p>
            <p class="gks-essays__lead">
              {{ ESSAY_DOCUMENT_KIND_LABELS[kind] }} бэлэн болмогц энд харагдана. Асуух зүйл байвал
              <NuxtLink to="/messages">зөвлөхдөө чатаар бичээрэй</NuxtLink>.
            </p>
          </div>
        </div>
      </DsCard>

      <template v-else>
        <div class="gks-essays__bar">
          <p v-if="current.status === 'APPROVED'" class="gks-essays__approved">
            <DsIcon name="circle-check" :size="16" /> Та {{ formatDateTime(current.approvedAt) }}-нд баталгаажуулсан
          </p>
          <p v-else class="gks-essays__meta">
            <template v-if="current.updatedAt">Сүүлд {{ formatDateTime(current.updatedAt) }}-нд шинэчлэгдсэн</template>
          </p>
          <div class="gks-essays__actions">
            <DsButton size="sm" variant="secondary" icon-left="file-down" @click="download">Word татах</DsButton>
            <DsButton v-if="current.status === 'SHARED' && !confirming" size="sm" variant="accent" icon-left="check" @click="confirming = true">
              Баталгаажуулах
            </DsButton>
          </div>
        </div>

        <DsCard v-if="confirming" accent>
          <div class="gks-essays__confirm">
            <p>
              <strong>Энэ хувилбарыг зөвшөөрч байна уу?</strong>
              <template v-if="openComments(current)">
                Таны {{ openComments(current) }} сэтгэгдэл хараахан шийдэгдээгүй байна —
                мэргэжилтэн засахыг хүлээж байгаа бол одоохондоо баталгаажуулахгүй байж болно.
              </template>
              Баталгаажуулсны дараа засвар орвол танаас дахин асууна.
            </p>
            <div class="gks-essays__confirm-actions">
              <DsButton variant="ghost" @click="confirming = false">Болих</DsButton>
              <DsButton variant="accent" icon-left="check" :loading="busy === 'approve'" @click="approve">Тийм, зөвшөөрч байна</DsButton>
            </div>
          </div>
        </DsCard>
        <p v-if="actionError" class="gks-essays__error">{{ actionError }}</p>

        <div class="gks-essays__grid">
          <ClientOnly>
            <EssayEditor :key="kind" :model-value="current.html" @select="quote = $event" />
          </ClientOnly>

          <aside class="gks-essays__side">
            <h2 class="gks-essays__side-title">
              Сэтгэгдэл
              <span v-if="current.comments.length" class="gks-tnum">({{ current.comments.length }})</span>
            </h2>
            <EssayComments
              :comments="current.comments"
              :quote="quote"
              :busy="busy === 'comment'"
              placeholder="Юуг засах, нэмэх вэ? Жишээ: «Энд 2024 оны олимпиадын медалиа нэмээрэй»"
              @add="addComment"
              @clear-quote="quote = ''"
            />
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-essays { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1320px; }
.gks-essays__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-essays__back:hover { color: var(--brand-600); }
.gks-essays__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-essays__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); line-height: var(--lh-heading); }
.gks-essays__lead { color: var(--text-body); line-height: var(--lh-body); max-width: 760px; }
.gks-essays__meta { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-essays__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-essays__kinds { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); max-width: 760px; }
.gks-essays__kind {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.gks-essays__kind--on { border-color: var(--brand-600); background: var(--brand-025); box-shadow: inset 0 -3px 0 var(--brand-600); }
.gks-essays__kind-name { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-essays__kind-en { font-size: var(--fs-caption); color: var(--text-muted); margin-bottom: var(--sp-1); }

.gks-essays__waiting { display: flex; gap: var(--sp-4); align-items: flex-start; color: var(--brand-600); }
.gks-essays__waiting-title { font-weight: var(--fw-semibold); color: var(--text-strong); margin-bottom: var(--sp-1); }

.gks-essays__bar { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.gks-essays__approved { display: flex; gap: var(--sp-2); align-items: center; color: var(--success-fg); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); }
.gks-essays__actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-essays__confirm { display: flex; flex-direction: column; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.gks-essays__confirm-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); flex-wrap: wrap; }

.gks-essays__grid { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: var(--sp-4); align-items: start; }
.gks-essays__side { position: sticky; top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); max-height: calc(100vh - var(--sp-8)); overflow-y: auto; padding: var(--sp-4); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-3); background: var(--surface-card); }
.gks-essays__side-title { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }

@media (max-width: 1000px) {
  .gks-essays__grid { grid-template-columns: minmax(0, 1fr); }
  .gks-essays__side { position: static; max-height: none; }
}
@media (max-width: 560px) {
  .gks-essays__kinds { grid-template-columns: minmax(0, 1fr); }
}
</style>
