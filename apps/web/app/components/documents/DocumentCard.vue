<script setup lang="ts">
import type { CaseDocument, DocumentStatus } from '@gks/shared';

/**
 * One row of the material checklist. The same card serves the client (1D-13/14/15)
 * and the staff reviewer (1D-16) — `mode` decides which actions appear, never
 * which data is fetched.
 */
const props = defineProps<{
  document: CaseDocument;
  mode: 'client' | 'staff';
  busy?: boolean;
}>();

const emit = defineEmits<{
  /** One action for the person: the files they picked, the words they typed, or both. */
  send: [payload: { files: File[]; note: string }];
  review: [action: 'ACCEPT' | 'REQUEST_FIX' | 'RETURN', note: string];
  transition: [status: DocumentStatus];
  open: [fileId: string];
}>();

const expanded = ref(false);
const reviewNote = ref('');
const clientNote = ref('');
/**
 * Picked, not yet sent. Uploading on selection and then offering a separate
 * "Илгээх" that only text could switch on made the file look like it was
 * waiting on a message it never needed — so the two share one button, and
 * either half of it may be empty.
 */
const staged = ref<File[]>([]);

const template = computed(() => props.document.template);

/** The certification chain the client must walk, as short chips. */
const requirements = computed(() =>
  [
    template.value.needsTranslation && { icon: 'languages', label: 'Орчуулга' },
    template.value.needsNotary && { icon: 'stamp', label: 'Нотариат' },
    template.value.needsApostille && { icon: 'shield-check', label: 'Апостиль' },
    template.value.needsPhysicalOriginal && { icon: 'briefcase', label: 'Эх хувиар авчрах' },
  ].filter((chip): chip is { icon: string; label: string } => Boolean(chip)),
);

/** Notes the client should read first — the "why" behind a returned document. */
const visibleNotes = computed(() => (props.document.notes ?? []).filter((note) => props.mode === 'staff' || !note.isInternal));

const needsAttention = computed(() => ['NEEDS_FIX', 'RESUBMIT_REQUIRED'].includes(props.document.status));
const canUpload = computed(() =>
  ['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_FIX', 'RESUBMIT_REQUIRED'].includes(props.document.status) || props.mode === 'staff',
);
const canReview = computed(() => props.mode === 'staff' && ['SUBMITTED', 'UNDER_REVIEW'].includes(props.document.status));

/** The next processing step staff can push an accepted document to (§7.2). */
const nextSteps = computed<{ status: DocumentStatus; label: string }[]>(() => {
  if (props.mode !== 'staff') return [];
  switch (props.document.status) {
    case 'ACCEPTED':
      return template.value.needsTranslation
        ? [{ status: 'IN_TRANSLATION', label: 'Орчуулгад өгөх' }]
        : [{ status: 'READY', label: 'Бэлэн болгох' }];
    case 'IN_TRANSLATION':
      return [{ status: 'TRANSLATED', label: 'Орчуулга дууссан' }];
    case 'TRANSLATED':
      return template.value.needsNotary
        ? [{ status: 'CERTIFIED', label: 'Баталгаажуулсан' }]
        : [{ status: 'READY', label: 'Бэлэн болгох' }];
    case 'CERTIFIED':
      return [{ status: 'READY', label: 'Бэлэн болгох' }];
    default:
      return [];
  }
});

const dueLabel = computed(() => {
  if (!props.document.dueAt) return null;
  const due = new Date(props.document.dueAt);
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  const date = formatDayMonth(due);
  if (days < 0) return { text: `${date} — хугацаа хэтэрсэн`, urgent: true };
  if (days <= 7) return { text: `${date} — ${days} хоног үлдсэн`, urgent: true };
  return { text: date, urgent: false };
});

function submitReview(action: 'ACCEPT' | 'REQUEST_FIX' | 'RETURN') {
  emit('review', action, reviewNote.value.trim());
  reviewNote.value = '';
}

function stage(files: File[]) {
  staged.value = [...staged.value, ...files];
}

function unstage(index: number) {
  staged.value.splice(index, 1);
}

const canSend = computed(() => !props.busy && (staged.value.length > 0 || clientNote.value.trim().length > 0));

function send() {
  if (!canSend.value) return;
  emit('send', { files: [...staged.value], note: clientNote.value.trim() });
  staged.value = [];
  clientNote.value = '';
}

function formatSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}
</script>

<template>
  <article class="gks-doc" :class="{ 'gks-doc--attention': needsAttention }">
    <header class="gks-doc__head">
      <button type="button" class="gks-doc__toggle" :aria-expanded="expanded" @click="expanded = !expanded">
        <DsIcon :name="expanded ? 'chevron-down' : 'chevron-right'" :size="16" />
      </button>

      <div class="gks-doc__title-block">
        <h3 class="gks-doc__title">{{ template.nameMn }}</h3>
        <p v-if="document.conditionNote" class="gks-doc__condition">{{ document.conditionNote }}</p>
      </div>

      <div class="gks-doc__meta">
        <DsBadge v-if="document.necessity !== 'REQUIRED'" tone="neutral">
          {{ NECESSITY_LABELS[document.necessity] }}
        </DsBadge>
        <DsBadge :tone="DOCUMENT_STATUS_TONE[document.status]">{{ DOCUMENT_STATUS_LABELS[document.status] }}</DsBadge>
      </div>
    </header>

    <div class="gks-doc__chips">
      <span v-for="chip in requirements" :key="chip.label" class="gks-doc__chip">
        <DsIcon :name="chip.icon" :size="12" /> {{ chip.label }}
      </span>
      <span v-if="dueLabel" class="gks-doc__chip" :class="{ 'gks-doc__chip--urgent': dueLabel.urgent }">
        <DsIcon name="calendar-clock" :size="12" /> {{ dueLabel.text }}
      </span>
      <span v-if="document.files.length" class="gks-doc__chip">
        <DsIcon name="paperclip" :size="12" /> {{ document.files.length }} файл
      </span>
    </div>

    <!-- The reason a document came back is the one thing a client must not miss (1D-15). -->
    <p v-if="needsAttention && visibleNotes[0]" class="gks-doc__fix">
      <DsIcon name="triangle-alert" :size="14" />
      <span>{{ visibleNotes[0].body }}</span>
    </p>

    <div v-if="expanded" class="gks-doc__body">
      <dl v-if="template.sourceHint || template.issuerHint || template.validityDays" class="gks-doc__facts">
        <div v-if="template.sourceHint">
          <dt>Хаанаас авах</dt>
          <dd>{{ template.sourceHint }}</dd>
        </div>
        <div v-if="template.issuerHint">
          <dt>Баталгаажуулах</dt>
          <dd>{{ template.issuerHint }}</dd>
        </div>
        <div v-if="template.validityDays">
          <dt>Хүчинтэй хугацаа</dt>
          <dd>{{ template.validityDays }} хоног</dd>
        </div>
      </dl>

      <p v-if="template.descriptionMn" class="gks-doc__text">{{ template.descriptionMn }}</p>
      <p v-if="template.tipsMn" class="gks-doc__tip"><DsIcon name="lightbulb" :size="14" /> {{ template.tipsMn }}</p>

      <ul v-if="document.files.length" class="gks-doc__files">
        <li v-for="file in document.files" :key="file.id" class="gks-doc__file">
          <DsIcon name="file-text" :size="16" />
          <button type="button" class="gks-doc__file-name" @click="emit('open', file.id)">{{ file.originalName }}</button>
          <span class="gks-doc__file-meta gks-tnum">v{{ file.version }} · {{ formatSize(file.sizeBytes) }}</span>
          <DsBadge v-if="file.isFinal" tone="success">Эцсийн хувилбар</DsBadge>
        </li>
      </ul>

      <DocumentsUploadZone
        v-if="canUpload"
        :accepted-file-types="template.acceptedFileTypes"
        :busy="busy"
        @select="stage"
      />

      <ul v-if="staged.length" class="gks-doc__staged">
        <li v-for="(file, index) in staged" :key="`${file.name}-${index}`" class="gks-doc__staged-item">
          <DsIcon name="file-text" :size="16" />
          <span class="gks-doc__staged-name">{{ file.name }}</span>
          <span class="gks-doc__file-meta gks-tnum">{{ formatSize(file.size) }}</span>
          <button type="button" class="gks-doc__staged-clear" aria-label="Хасах" @click="unstage(index)">
            <DsIcon name="x" :size="14" />
          </button>
        </li>
      </ul>

      <div v-if="canReview" class="gks-doc__review">
        <DsTextarea v-model="reviewNote" :rows="2" placeholder="Тайлбар — засвар хүсэх/буцаах үед заавал" />
        <div class="gks-doc__actions">
          <DsButton size="sm" variant="accent" icon-left="check" :disabled="busy" @click="submitReview('ACCEPT')">
            Зөвшөөрөх
          </DsButton>
          <DsButton size="sm" variant="secondary" icon-left="pencil" :disabled="busy" @click="submitReview('REQUEST_FIX')">
            Засвар хүсэх
          </DsButton>
          <DsButton size="sm" variant="danger" icon-left="undo-2" :disabled="busy" @click="submitReview('RETURN')">
            Буцаах
          </DsButton>
        </div>
      </div>

      <div v-if="nextSteps.length" class="gks-doc__actions">
        <DsButton
          v-for="step in nextSteps"
          :key="step.status"
          size="sm"
          variant="secondary"
          :disabled="busy"
          @click="emit('transition', step.status)"
        >
          {{ step.label }}
        </DsButton>
      </div>

      <section v-if="visibleNotes.length" class="gks-doc__notes">
        <h4 class="gks-doc__notes-title">Тайлбарууд</h4>
        <ul>
          <li v-for="note in visibleNotes" :key="note.id" class="gks-doc__note">
            <p class="gks-doc__note-body">{{ note.body }}</p>
            <p class="gks-doc__note-meta">
              {{ note.author?.name ?? 'Систем' }} · {{ formatDayMonthTime(note.createdAt) }}
              <template v-if="note.isInternal"> · дотоод</template>
            </p>
          </li>
        </ul>
      </section>

      <div class="gks-doc__ask">
        <DsInput
          v-model="clientNote"
          :placeholder="staged.length ? 'Тайлбар нэмэх (заавал биш)' : 'Асуулт эсвэл тэмдэглэл бичих'"
          @keyup.enter="send"
        />
        <DsButton
          size="sm"
          :variant="staged.length ? 'accent' : 'ghost'"
          icon-left="send"
          :disabled="!canSend"
          @click="send"
        >
          Илгээх
        </DsButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.gks-doc {
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  padding: var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gks-doc--attention { border-color: var(--warning-line); background: var(--warning-bg); }

.gks-doc__head { display: flex; align-items: flex-start; gap: var(--sp-2); }
.gks-doc__toggle {
  flex: none;
  margin-top: 2px;
  border: 0;
  background: none;
  color: var(--text-subtle);
  cursor: pointer;
  padding: 2px;
}
.gks-doc__title-block { flex: 1; min-width: 0; }
.gks-doc__title { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-doc__condition { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-subtle); font-style: italic; }
.gks-doc__meta { display: flex; gap: var(--sp-2); flex-wrap: wrap; justify-content: flex-end; }

.gks-doc__chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); padding-left: calc(var(--sp-2) + 20px); }
.gks-doc__chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
  background: var(--n-050);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  padding: 2px var(--sp-2);
}
.gks-doc__chip--urgent { color: var(--danger-fg); background: var(--danger-bg); border-color: var(--danger-line); }

.gks-doc__fix {
  display: flex;
  gap: var(--sp-2);
  align-items: flex-start;
  font-size: var(--fs-body-sm);
  color: var(--warning-fg);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--warning-line);
  border-radius: var(--radius-2);
  padding: var(--sp-3);
}

.gks-doc__body { display: flex; flex-direction: column; gap: var(--sp-4); padding-left: calc(var(--sp-2) + 20px); }
.gks-doc__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); }
.gks-doc__facts dt { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
.gks-doc__facts dd { font-size: var(--fs-body-sm); color: var(--text-body); margin-top: 2px; }
.gks-doc__text { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-doc__tip { display: flex; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-doc__files { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-doc__file { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-doc__file-name {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  color: var(--brand-700);
  text-decoration: underline;
  cursor: pointer;
  text-align: left;
}
.gks-doc__file-meta { color: var(--text-subtle); font-size: var(--fs-caption); }

.gks-doc__review { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-doc__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.gks-doc__notes-title { font-size: var(--fs-label); font-weight: var(--fw-semibold); margin-bottom: var(--sp-2); }
.gks-doc__note { padding: var(--sp-2) 0; border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-doc__note:last-child { border-bottom: 0; }
.gks-doc__note-body { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-doc__note-meta { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-doc__staged { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-doc__staged-item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  font-size: var(--fs-body-sm);
}
.gks-doc__staged-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gks-doc__staged-clear { flex: none; display: inline-flex; border: 0; padding: 2px; background: none; color: var(--text-subtle); cursor: pointer; }
.gks-doc__staged-clear:hover { color: var(--danger-fg); }

.gks-doc__ask { display: flex; gap: var(--sp-2); align-items: flex-start; }
.gks-doc__ask > :first-child { flex: 1; }

/* On a phone the field and the button do not share a line comfortably. */
@media (max-width: 520px) {
  .gks-doc__ask { flex-wrap: wrap; }
  .gks-doc__ask > :first-child { flex: 1 1 100%; }
}
</style>
