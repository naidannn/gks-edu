<script setup lang="ts">
import type { EssayDocumentKind, EssayDocumentListView, EssayDocumentView, EssayQuestionnaireView } from '@gks/shared';

/**
 * Where the writer writes the Personal Statement and Study Plan (1D-28): the
 * essay on the left, the client's questionnaire answers for that essay on the
 * right, and the client's comments one tab over. Replaces "copy the answers,
 * write in Word, upload, download again for every correction".
 *
 * Both essays autosave, each against the version it was loaded at, so two
 * writers on one essay get told instead of overwriting each other.
 */
const props = defineProps<{ caseId: string; essay: EssayQuestionnaireView }>();

const api = useApi();
const KINDS: EssayDocumentKind[] = ['PERSONAL_STATEMENT', 'STUDY_PLAN'];

const list = ref<EssayDocumentListView | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busy = ref<string | null>(null);
const conflict = ref(false);
const kind = ref<EssayDocumentKind>('PERSONAL_STATEMENT');
const side = ref<'answers' | 'comments'>('answers');
const quote = ref('');

// The live text of each essay, and the version each was loaded at.
const html = reactive<Record<EssayDocumentKind, string>>({ PERSONAL_STATEMENT: '', STUDY_PLAN: '' });
const versions = reactive<Record<EssayDocumentKind, number>>({ PERSONAL_STATEMENT: 0, STUDY_PLAN: 0 });

const autosave = useQuestionnaireAutosave({
  current: () => Object.fromEntries(KINDS.map((key) => [key, { html: html[key] }])),
  save: async (patch) => {
    for (const key of KINDS) {
      if (patch[key]?.html === undefined) continue;
      try {
        const saved = await api.put<EssayDocumentView>(`/cases/${props.caseId}/essay/documents/${key}`, {
          html: html[key],
          baseVersion: versions[key],
        });
        versions[key] = saved.version;
        replaceDocument(saved, false);
      } catch (error) {
        if (apiErrorStatus(error) === 409) conflict.value = true;
        throw error;
      }
    }
  },
});

// Every keystroke in either essay; `touch` works out whether anything is unsaved.
watch(() => [html.PERSONAL_STATEMENT, html.STUDY_PLAN], () => autosave.touch());

async function load() {
  try {
    list.value = await api.get<EssayDocumentListView>(`/cases/${props.caseId}/essay/documents`);
    for (const doc of list.value.documents) {
      html[doc.kind] = doc.html;
      versions[doc.kind] = doc.version;
    }
    autosave.reset();
    conflict.value = false;
    // The client's remarks are what the writer came back for.
    if (list.value.documents.some((doc) => openComments(doc))) side.value = 'comments';
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Эссэг ачаалж чадсангүй');
  }
}
onMounted(load);

/** Takes the server's copy of one essay; its text only when asked to. */
function replaceDocument(next: EssayDocumentView, withText = true) {
  if (!list.value) return;
  list.value = {
    ...list.value,
    documents: list.value.documents.map((doc) => (doc.kind === next.kind ? { ...next, html: withText ? next.html : html[next.kind] } : doc)),
  };
}

const current = computed(() => list.value?.documents.find((doc) => doc.kind === kind.value) ?? null);
const openComments = (doc: EssayDocumentView) => doc.comments.filter((comment) => !comment.resolvedAt).length;
const answers = computed(() => (props.essay.definition ? essayDefinitionFor(props.essay.definition, kind.value) : null));
const outline = computed(() => (props.essay.definition ? essayOutlineHtml(props.essay.definition, kind.value) : ''));

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

const setStatus = (status: 'DRAFT' | 'SHARED') =>
  run(`status:${status}`, async () => {
    await autosave.flush();
    const next = await api.post<EssayDocumentView>(`/cases/${props.caseId}/essay/documents/${kind.value}/status`, { status });
    replaceDocument(next, false);
  });

const addComment = (comment: { body: string; quote: string | null }) =>
  run('comment', async () => {
    const next = await api.post<EssayDocumentView>(`/cases/${props.caseId}/essay/documents/${kind.value}/comments`, {
      body: comment.body,
      quote: comment.quote ?? undefined,
    });
    replaceDocument(next, false);
    quote.value = '';
  });

const resolveComment = (id: string, resolved: boolean) =>
  run(`resolve:${id}`, async () => {
    const next = await api.post<EssayDocumentView>(
      `/cases/${props.caseId}/essay/documents/${kind.value}/comments/${id}/resolve`,
      { resolved },
    );
    replaceDocument(next, false);
  });

async function reloadAfterConflict() {
  // What this writer typed is not thrown away silently: it goes to the clipboard first.
  const mine = html[kind.value];
  if (mine) await navigator.clipboard.writeText(mine.replace(/<\/(p|h\d|li)>/g, '\n').replace(/<[^>]+>/g, '')).catch(() => undefined);
  await load();
}

const editorRef = ref<{ setContent: (html: string) => void } | null>(null);
function startFromOutline() {
  editorRef.value?.setContent(outline.value);
}

function download() {
  const title = ESSAY_DOCUMENT_KIND_TITLES[kind.value];
  downloadWordDocument(title, html[kind.value], essayFileName(props.essay.applicantName, title));
}

function pickKind(next: EssayDocumentKind) {
  kind.value = next;
  quote.value = '';
  void autosave.flush();
}

const SAVE_LABELS = { idle: '', dirty: 'Хадгалаагүй өөрчлөлт…', saving: 'Хадгалж байна…', saved: 'Хадгалагдсан', error: '' } as const;
</script>

<template>
  <div class="gks-desk">
    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="!list || !current" class="gks-skeleton__row gks-skeleton--page" />

    <template v-else>
      <div class="gks-desk__bar">
        <div class="gks-desk__kinds" role="tablist" aria-label="Эссэ">
          <button
            v-for="doc in list.documents"
            :key="doc.kind"
            type="button"
            role="tab"
            class="gks-desk__kind"
            :class="{ 'gks-desk__kind--on': doc.kind === kind }"
            :aria-selected="doc.kind === kind"
            @click="pickKind(doc.kind)"
          >
            <span class="gks-desk__kind-name">{{ ESSAY_DOCUMENT_KIND_LABELS[doc.kind] }}</span>
            <span class="gks-desk__kind-state">
              <DsBadge :tone="ESSAY_DOCUMENT_STATUS_TONES[doc.status]">{{ ESSAY_DOCUMENT_STATUS_STAFF_LABELS[doc.status] }}</DsBadge>
              <span v-if="openComments(doc)" class="gks-desk__count gks-tnum" :title="`${openComments(doc)} шийдээгүй сэтгэгдэл`">
                <DsIcon name="message-square" :size="12" /> {{ openComments(doc) }}
              </span>
            </span>
          </button>
        </div>

        <div class="gks-desk__actions">
          <span class="gks-desk__saved" :class="{ 'gks-desk__saved--error': autosave.state.value === 'error' }">
            <template v-if="autosave.state.value === 'error'">{{ autosave.errorMessage.value }}</template>
            <template v-else>{{ SAVE_LABELS[autosave.state.value] }}</template>
            <template v-if="autosave.state.value === 'idle' && current.updatedAt">
              Сүүлд {{ formatDateTime(current.updatedAt) }}<template v-if="current.editedByName"> · {{ current.editedByName }}</template>
            </template>
          </span>
          <DsButton size="sm" variant="secondary" icon-left="file-down" :disabled="!html[kind]" @click="download">Word татах</DsButton>
          <DsButton
            v-if="current.status === 'DRAFT'"
            size="sm"
            variant="accent"
            icon-left="send"
            :loading="busy === 'status:SHARED'"
            :disabled="!html[kind]"
            @click="setStatus('SHARED')"
          >
            Үйлчлүүлэгчид харуулах
          </DsButton>
          <DsButton v-else size="sm" variant="ghost" icon-left="eye-off" :loading="busy === 'status:DRAFT'" @click="setStatus('DRAFT')">
            Нуух
          </DsButton>
        </div>
      </div>

      <p v-if="conflict" class="gks-desk__conflict">
        <DsIcon name="triangle-alert" :size="16" />
        <span>Энэ эссэг өөр ажилтан таныг бичиж байхад хадгалсан. Сүүлийн хувилбарыг ачаалбал таны бичсэн текст санах ойд хуулагдана.</span>
        <DsButton size="sm" variant="primary" @click="reloadAfterConflict">Сүүлийн хувилбарыг ачаалах</DsButton>
      </p>
      <p v-if="actionError" class="gks-desk__error">{{ actionError }}</p>
      <p v-if="current.status === 'APPROVED'" class="gks-desk__note">
        <DsIcon name="circle-check" :size="16" />
        Үйлчлүүлэгч {{ formatDateTime(current.approvedAt) }}-нд баталгаажуулсан. Одоо засвал дахин баталгаажуулах хүсэлт очно.
      </p>

      <div class="gks-desk__grid">
        <div class="gks-desk__main">
          <div v-if="!html[kind] && outline" class="gks-desk__outline">
            <span>Асуулгын хэсгүүдээр гарчиг үүсгээд эхлэх үү?</span>
            <DsButton size="sm" variant="secondary" icon-left="list-tree" @click="startFromOutline">Бүтэц оруулах</DsButton>
          </div>
          <ClientOnly>
            <EssayEditor
              :key="kind"
              ref="editorRef"
              v-model="html[kind]"
              editable
              :placeholder="`${ESSAY_DOCUMENT_KIND_TITLES[kind]} — энд бичнэ үү. Word-оос хуулж буулгаж болно.`"
              @select="quote = $event"
            />
          </ClientOnly>
        </div>

        <aside class="gks-desk__side">
          <div class="gks-tabs" role="tablist">
            <button type="button" class="gks-tab" :class="{ 'gks-tab--active': side === 'answers' }" @click="side = 'answers'">
              <DsIcon name="notebook-pen" :size="16" /><span>Асуулгын хариулт</span>
            </button>
            <button type="button" class="gks-tab" :class="{ 'gks-tab--active': side === 'comments' }" @click="side = 'comments'">
              <DsIcon name="message-square" :size="16" /><span>Сэтгэгдэл</span>
              <span v-if="openComments(current)" class="gks-tab__count gks-tnum">{{ openComments(current) }}</span>
            </button>
          </div>

          <div class="gks-desk__panel">
            <template v-if="side === 'answers'">
              <QuestionnaireAnswerList v-if="answers && essay.questionnaire" :definition="answers" :answers="essay.questionnaire.answers" />
              <p v-else class="gks-desk__empty">Үйлчлүүлэгч эссэний асуулгаа хараахан бөглөөгүй байна.</p>
            </template>
            <EssayComments
              v-else
              :comments="current.comments"
              :quote="quote"
              :busy="busy === 'comment'"
              can-resolve
              placeholder="Үйлчлүүлэгчид хариулах, эсвэл тайлбар үлдээх…"
              @add="addComment"
              @resolve="resolveComment"
              @clear-quote="quote = ''"
            />
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gks-desk { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-desk__bar { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: center; justify-content: space-between; }
.gks-desk__kinds { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-desk__kind {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-2) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.gks-desk__kind--on { border-color: var(--brand-600); background: var(--brand-025); box-shadow: inset 0 -2px 0 var(--brand-600); }
.gks-desk__kind-name { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-desk__kind-state { display: flex; gap: var(--sp-2); align-items: center; }
.gks-desk__count { display: inline-flex; align-items: center; gap: 2px; font-size: var(--fs-caption); color: var(--amber-700, var(--text-muted)); }
.gks-desk__actions { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.gks-desk__saved { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-desk__saved--error { color: var(--danger-fg); }
.gks-desk__conflict { display: flex; gap: var(--sp-3); align-items: center; flex-wrap: wrap; padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-2); background: var(--danger-bg, var(--amber-050)); color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-desk__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-desk__note { display: flex; gap: var(--sp-2); align-items: center; color: var(--success-fg); font-size: var(--fs-body-sm); }

.gks-desk__grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: var(--sp-4); align-items: start; }
.gks-desk__main { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
.gks-desk__outline { display: flex; gap: var(--sp-3); align-items: center; justify-content: space-between; flex-wrap: wrap; padding: var(--sp-3) var(--sp-4); border: var(--border-hair) dashed var(--brand-400); border-radius: var(--radius-2); background: var(--brand-025); font-size: var(--fs-body-sm); }
.gks-desk__side { position: sticky; top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); max-height: calc(100vh - var(--sp-8)); min-width: 0; }
.gks-desk__panel { overflow-y: auto; padding: var(--sp-4); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-3); background: var(--surface-card); }
.gks-desk__empty { color: var(--text-subtle); font-style: italic; font-size: var(--fs-body-sm); }

@media (max-width: 1100px) {
  .gks-desk__grid { grid-template-columns: minmax(0, 1fr); }
  .gks-desk__side { position: static; max-height: none; }
}
</style>
