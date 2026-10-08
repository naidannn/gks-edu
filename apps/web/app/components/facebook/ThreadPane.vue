<script setup lang="ts">
import type { FacebookMessageItem, FacebookThreadDetail, FacebookThreadItem } from '@gks/shared';

/**
 * One Messenger thread (2F): who the person is, what the assistant is doing
 * with them, and the conversation itself.
 *
 * The header carries the two facts that decide whether to type at all:
 *
 * - **Meta's window.** Inside 24 hours of their last message a reply is
 *   ordinary; up to seven days it goes as a human-agent message; after that
 *   Meta refuses anything. The composer says which, and locks when closed, so
 *   nobody writes a careful answer that cannot be sent.
 * - **The assistant's state.** A staff reply pauses it in this thread for a
 *   while (server-side), so a person taking over is never talked over. The
 *   resume / off / on buttons are for when that default is wrong.
 *
 * The page polls; this component only renders what it is given and reports
 * changes back up, so there is one copy of the thread and no drift between it
 * and the list.
 */
const props = defineProps<{
  thread: FacebookThreadDetail | null;
  pending?: boolean;
  /** The knowledge base is staff-only, so document officers are not offered it. */
  canTeach?: boolean;
  /** Deleting a thread answers a data-deletion request and cannot be undone — admins only. */
  canDelete?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  /** A PATCH answered with the new thread state — the page merges it in. */
  changed: [thread: FacebookThreadItem];
  /** Something changed that only a re-read shows (a sent message, a pause). */
  refresh: [];
  /** The thread no longer exists. */
  deleted: [id: string];
}>();

const api = useApi();

const GROUP_WINDOW_MS = 5 * 60_000;
const STICK_THRESHOLD_PX = 120;
const MAX_LENGTH = 2000;

const scroller = ref<HTMLElement | null>(null);
const field = ref<HTMLTextAreaElement | null>(null);
const atBottom = ref(true);

const panel = ref<'link' | 'info' | null>(null);
const draft = ref('');
const sending = ref(false);
const sendError = ref<string | null>(null);
const aiBusy = ref(false);
const actionError = ref<string | null>(null);
const deleting = ref(false);

/**
 * A data-deletion request (`/data-deletion`): the thread, its messages, the
 * comments behind it and the assistant's sessions all go. Asked twice — once by
 * the browser, once by the server's audit log — because nothing brings it back.
 */
async function removeThread(): Promise<void> {
  const thread = props.thread;
  if (!thread) return;
  const who = thread.name ?? 'энэ хүн';
  if (!globalThis.confirm(`${who}-ий Facebook чат, мессеж, сэтгэгдлийг бүрмөсөн устгах уу? Буцаах боломжгүй.`)) return;

  deleting.value = true;
  actionError.value = null;
  try {
    await api.delete(`/admin/facebook/threads/${thread.id}`);
    emit('deleted', thread.id);
  } catch (e) {
    actionError.value = apiErrorMessage(e, 'Устгаж чадсангүй');
  } finally {
    deleting.value = false;
  }
}

/**
 * Replies turned into answer cards during this visit. The next poll brings the
 * id back on the message itself; until then this keeps the link from flickering
 * back into a button somebody might press twice.
 */
const taught = ref<Record<string, string>>({});
const teachingId = ref<string | null>(null);

const ai = computed(() => (props.thread ? facebookAiState(props.thread) : 'IDLE'));
const aiLabel = computed(() =>
  ai.value === 'PAUSED' ? facebookPauseLabel(props.thread?.aiPausedUntil ?? null) : FACEBOOK_AI_STATE_LABELS[ai.value],
);

const closed = computed(() => props.thread?.window === 'CLOSED');

const rows = computed(() => {
  const messages = (props.thread?.messages ?? []).map((message) =>
    taught.value[message.id] ? { ...message, knowledgeDocumentId: taught.value[message.id] ?? null } : message,
  );

  const sameRun = (a: FacebookMessageItem | undefined, b: FacebookMessageItem | undefined) =>
    Boolean(
      a &&
        b &&
        a.sender === b.sender &&
        a.staffName === b.staffName &&
        Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_WINDOW_MS,
    );

  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const dayLabel =
      !previous || messageDay(previous.createdAt) !== messageDay(message.createdAt) ? messageDay(message.createdAt) : null;
    return {
      message,
      dayLabel,
      leading: Boolean(dayLabel) || !sameRun(previous, message),
      trailing: !next || !sameRun(message, next) || messageDay(next.createdAt) !== messageDay(message.createdAt),
    };
  });
});

// ── Scrolling ────────────────────────────────────────────────────────────────

function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  const el = scroller.value;
  if (el) el.scrollTo({ top: el.scrollHeight, behavior });
}

function onScroll(): void {
  const el = scroller.value;
  if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
}

// A poll that brings new lines follows them only if the reader is already at
// the bottom — someone scrolled up reading last week's exchange stays put.
watch(
  () => props.thread?.messages.length ?? 0,
  (next, previous) => {
    if (next <= (previous ?? 0)) return;
    void nextTick(() => {
      if (atBottom.value) scrollToBottom('smooth');
    });
  },
);

watch(
  () => props.thread?.id,
  () => {
    atBottom.value = true;
    panel.value = null;
    draft.value = '';
    sendError.value = null;
    actionError.value = null;
    taught.value = {};
    void nextTick(() => {
      scrollToBottom();
      field.value?.focus();
    });
  },
);

onMounted(() => nextTick(() => scrollToBottom()));

// ── Composer ─────────────────────────────────────────────────────────────────

const canSend = computed(() => Boolean(draft.value.trim()) && !sending.value && !closed.value && Boolean(props.thread));

async function send(): Promise<void> {
  const id = props.thread?.id;
  const text = draft.value.trim();
  if (!id || !canSend.value) return;
  sending.value = true;
  sendError.value = null;
  try {
    await api.post<FacebookMessageItem>(`/admin/facebook/threads/${id}/messages`, { text });
    // Only cleared once Meta accepted it: a refused send keeps what was typed.
    draft.value = '';
    atBottom.value = true;
    emit('refresh');
  } catch (e) {
    sendError.value = apiErrorMessage(e, 'Мессеж илгээж чадсангүй');
  } finally {
    sending.value = false;
  }
}

function onKeydown(event: KeyboardEvent): void {
  // An IME accepting a Cyrillic or Hangul candidate uses Enter too.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void send();
}

// ── Assistant and knowledge ──────────────────────────────────────────────────

async function setAi(body: { mode?: 'AUTO' | 'OFF'; resume?: true }): Promise<void> {
  const id = props.thread?.id;
  if (!id) return;
  aiBusy.value = true;
  actionError.value = null;
  try {
    emit('changed', await api.patch<FacebookThreadItem>(`/admin/facebook/threads/${id}/ai`, body));
  } catch (e) {
    actionError.value = apiErrorMessage(e, 'AI-н төлөвийг өөрчилж чадсангүй');
  } finally {
    aiBusy.value = false;
  }
}

async function teach(message: FacebookMessageItem): Promise<void> {
  teachingId.value = message.id;
  actionError.value = null;
  try {
    const { documentId } = await api.post<{ documentId: string }>(`/admin/facebook/messages/${message.id}/knowledge`);
    taught.value = { ...taught.value, [message.id]: documentId };
  } catch (e) {
    actionError.value = apiErrorMessage(e, 'Мэдлэгийн санд нэмж чадсангүй');
  } finally {
    teachingId.value = null;
  }
}

function togglePanel(name: 'link' | 'info'): void {
  panel.value = panel.value === name ? null : name;
}

function onLinked(next: FacebookThreadItem): void {
  emit('changed', next);
}

// ── What the assistant noted ─────────────────────────────────────────────────

/** The keys the assistant is known to write; anything else shows as it came. */
const PROFILE_KEYS: Record<string, string> = {
  name: 'Нэр',
  phone: 'Утас',
  email: 'И-мэйл',
  age: 'Нас',
  education: 'Боловсрол',
  school: 'Сургууль',
  gpa: 'Голч дүн',
  level: 'Түвшин',
  service: 'Үйлчилгээ',
  interest: 'Сонирхол',
  topik: 'TOPIK',
  ad_id: 'Зарын ID',
  source: 'Эх сурвалж',
  ref: 'Ref',
  type: 'Төрөл',
};

function entries(record: Record<string, unknown> | null | undefined): { key: string; label: string; value: string }[] {
  if (!record) return [];
  return Object.entries(record)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: PROFILE_KEYS[key] ?? key,
      value: Array.isArray(value)
        ? value.join(', ')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value),
    }));
}

const profileRows = computed(() => entries(props.thread?.profile));
const referralRows = computed(() => entries(props.thread?.referral));
</script>

<template>
  <section class="gks-fbt">
    <header class="gks-fbt__head">
      <div class="gks-fbt__bar">
        <button type="button" class="gks-fbt__back" aria-label="Буцах" @click="emit('back')">
          <DsIcon name="arrow-left" :size="18" />
        </button>

        <div class="gks-fbt__who">
          <p class="gks-fbt__name">
            {{ thread?.name ?? (pending ? 'Ачаалж байна…' : 'Нэргүй харилцагч') }}
            <DsBadge v-if="thread" :tone="FACEBOOK_WINDOW_TONE[thread.window]">
              {{ FACEBOOK_WINDOW_LABELS[thread.window] }}
            </DsBadge>
          </p>
          <p class="gks-fbt__meta">
            <template v-if="thread?.lead">
              Сэжим: <NuxtLink :to="`/admin/consultations/${thread.lead.id}`">{{ thread.lead.name }}</NuxtLink>
            </template>
            <template v-if="thread?.lead && thread.client"> · </template>
            <template v-if="thread?.client">
              <NuxtLink :to="`/admin/clients/${thread.client.id}`" class="gks-tnum">{{ thread.client.code }}</NuxtLink>
              {{ thread.client.name }}
            </template>
            <template v-if="thread && !thread.lead && !thread.client">CRM-тэй холбоогүй</template>
            <template v-if="thread?.aiSessionCode"> · <span class="gks-tnum">{{ thread.aiSessionCode }}</span></template>
          </p>
        </div>

        <div v-if="thread" class="gks-fbt__actions">
          <DsBadge :tone="FACEBOOK_AI_STATE_TONE[ai]" icon="bot">AI: {{ aiLabel }}</DsBadge>
          <DsButton
            v-if="ai === 'PAUSED'"
            size="sm"
            variant="secondary"
            icon-left="play"
            :loading="aiBusy"
            @click="setAi({ resume: true })"
          >
            Үргэлжлүүлэх
          </DsButton>
          <DsButton
            v-if="thread.aiMode === 'AUTO'"
            size="sm"
            variant="ghost"
            icon-left="power-off"
            :loading="aiBusy"
            @click="setAi({ mode: 'OFF' })"
          >
            AI унтраах
          </DsButton>
          <DsButton v-else size="sm" variant="secondary" icon-left="power" :loading="aiBusy" @click="setAi({ mode: 'AUTO' })">
            AI асаах
          </DsButton>
          <DsButton
            size="sm"
            :variant="panel === 'link' ? 'primary' : 'secondary'"
            icon-left="link"
            @click="togglePanel('link')"
          >
            Холбох
          </DsButton>
          <DsButton
            size="sm"
            :variant="panel === 'info' ? 'primary' : 'ghost'"
            icon-left="info"
            aria-label="AI-н тэмдэглэсэн мэдээлэл"
            @click="togglePanel('info')"
          >
            Мэдээлэл
          </DsButton>
        </div>
      </div>

      <p v-if="thread?.needsStaff" class="gks-fbt__note gks-fbt__note--alert">
        <DsIcon name="triangle-alert" :size="14" />
        Энэ хүнд AI хариулахгүй — ажилтан хариулах хэрэгтэй.
      </p>
      <p v-if="actionError" class="gks-fbt__note gks-fbt__note--error" role="alert">{{ actionError }}</p>

      <FacebookLinkPanel
        v-if="panel === 'link' && thread"
        :key="thread.id"
        :thread="thread"
        @changed="onLinked"
        @close="panel = null"
      />

      <section v-if="panel === 'info' && thread" class="gks-fbt__info" aria-label="Нэмэлт мэдээлэл">
        <div>
          <h3 class="gks-fbt__info-title">AI-н тэмдэглэсэн</h3>
          <dl v-if="profileRows.length" class="gks-fbt__dl">
            <template v-for="row in profileRows" :key="row.key">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
          <p v-else class="gks-fbt__muted">Одоогоор юу ч тэмдэглээгүй.</p>
        </div>
        <div>
          <h3 class="gks-fbt__info-title">Хаанаас ирсэн</h3>
          <dl v-if="referralRows.length" class="gks-fbt__dl">
            <template v-for="row in referralRows" :key="row.key">
              <dt>{{ row.label }}</dt>
              <dd class="gks-tnum">{{ row.value }}</dd>
            </template>
          </dl>
          <p v-else class="gks-fbt__muted">Шууд бичсэн (зар, холбоосгүй).</p>
          <dl class="gks-fbt__dl gks-fbt__dl--ids">
            <dt>AI сесс</dt>
            <dd class="gks-tnum">{{ thread.aiSessionCode ?? '—' }}</dd>
            <dt>PSID</dt>
            <dd class="gks-tnum">{{ thread.psid }}</dd>
          </dl>
          <DsButton
            v-if="canDelete"
            size="sm"
            variant="ghost"
            icon-left="trash-2"
            class="gks-fbt__delete"
            :loading="deleting"
            @click="removeThread"
          >
            Өгөгдлийг устгах
          </DsButton>
        </div>
      </section>
    </header>

    <div ref="scroller" class="gks-fbt__scroll" @scroll.passive="onScroll">
      <div v-if="pending && !thread" class="gks-fbt__loading">
        <span v-for="n in 3" :key="n" class="gks-fbt__skeleton" :class="`gks-fbt__skeleton--${n}`" />
      </div>

      <template v-else-if="thread">
        <p v-if="!rows.length" class="gks-fbt__start">Мессеж алга.</p>
        <template v-for="row in rows" :key="row.message.id">
          <div v-if="row.dayLabel" class="gks-fbt__day"><span>{{ row.dayLabel }}</span></div>
          <FacebookBubble
            :message="row.message"
            :leading="row.leading"
            :trailing="row.trailing"
            :can-teach="canTeach"
            :teaching="teachingId === row.message.id"
            @teach="teach"
          />
        </template>
      </template>
    </div>

    <footer class="gks-fbt__foot">
      <p v-if="closed" class="gks-fbt__window gks-fbt__window--closed">
        <DsIcon name="lock" :size="14" />
        Энэ хүн сүүлийн 7 хоногт Messenger-ээр бичээгүй тул Meta хариу илгээхийг зөвшөөрөхгүй (сэтгэгдлийн хувийн хариуны дараа ч мөн адил). Тухайн хүн бичихэд нээгдэнэ.
      </p>
      <p v-else-if="thread?.window === 'HUMAN_AGENT'" class="gks-fbt__window">
        <DsIcon name="clock" :size="14" />
        24 цаг өнгөрсөн — хариу «human agent» шошготой явна. Сүүлийн мессежээс хойш 7 хоног хүртэл бичих боломжтой.
      </p>
      <p v-if="sendError" class="gks-fbt__window gks-fbt__window--closed" role="alert">{{ sendError }}</p>

      <div class="gks-fbt__box" :class="{ 'gks-fbt__box--disabled': closed }">
        <textarea
          ref="field"
          v-model="draft"
          class="gks-fbt__field"
          rows="2"
          :maxlength="MAX_LENGTH"
          :disabled="closed || !thread"
          :placeholder="closed ? 'Цонх хаагдсан' : 'Facebook-ээр хариу бичих…'"
          aria-label="Facebook-ээр хариу бичих"
          @keydown="onKeydown"
        />
        <button
          type="button"
          class="gks-fbt__send"
          :disabled="!canSend"
          :aria-label="sending ? 'Илгээж байна' : 'Илгээх'"
          @click="send"
        >
          <DsIcon :name="sending ? 'loader-circle' : 'send-horizontal'" :size="18" :class="{ 'gks-fbt__spin': sending }" />
        </button>
      </div>
      <p class="gks-fbt__hint">
        Таны хариу илгээгдэхэд энэ чатад AI түр зогсоно.
        <span class="gks-fbt__keys"><kbd>Enter</kbd> илгээх · <kbd>Shift</kbd>+<kbd>Enter</kbd> шинэ мөр</span>
      </p>
    </footer>
  </section>
</template>

<style scoped>
.gks-fbt {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--surface-page);
}

.gks-fbt__head {
  flex: none;
  max-height: 55%;
  overflow-y: auto;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
  scrollbar-width: thin;
}

.gks-fbt__bar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 64px;
  padding: var(--sp-3) var(--sp-6);
}
.gks-fbt__who { flex: 1; min-width: 0; }
.gks-fbt__name {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-fbt__name .gks-badge { margin-left: var(--sp-2); vertical-align: 1px; }
.gks-fbt__meta { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-fbt__meta a { color: var(--text-muted); text-decoration: none; font-weight: var(--fw-semibold); }
.gks-fbt__meta a:hover { color: var(--brand-600); text-decoration: underline; }

.gks-fbt__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--sp-2); }

.gks-fbt__back {
  display: none;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.gks-fbt__note {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-6);
  border-top: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
}
.gks-fbt__note--alert { background: var(--red-050); color: var(--red-800); }
.gks-fbt__note--error { background: var(--danger-bg); color: var(--danger-fg); }

.gks-fbt__info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-5);
  padding: var(--sp-4) var(--sp-6);
  border-top: var(--border-hair) solid var(--line-soft);
  background: var(--surface-sunken);
}
.gks-fbt__info-title {
  margin-bottom: var(--sp-2);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-fbt__dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--sp-1) var(--sp-3);
  font-size: var(--fs-micro);
}
.gks-fbt__dl dt { color: var(--text-subtle); }
.gks-fbt__dl dd { margin: 0; color: var(--text-body); overflow-wrap: anywhere; }
.gks-fbt__dl--ids { margin-top: var(--sp-3); }
.gks-fbt__muted { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-fbt__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-4) var(--sp-6) var(--sp-6);
  scrollbar-width: thin;
}

.gks-fbt__day { display: flex; align-items: center; gap: var(--sp-3); margin: var(--sp-6) 0 var(--sp-2); }
.gks-fbt__day::before,
.gks-fbt__day::after { content: ''; flex: 1; height: 1px; background: var(--line-soft); }
.gks-fbt__day span {
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-fbt__start { padding: var(--sp-6) 0; text-align: center; font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-fbt__loading { display: flex; flex-direction: column; gap: var(--sp-4); padding-top: var(--sp-4); }
.gks-fbt__skeleton {
  height: 44px;
  border-radius: var(--radius-3);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-fbt-shimmer 1.4s ease-in-out infinite;
}
.gks-fbt__skeleton--1 { width: 58%; }
.gks-fbt__skeleton--2 { width: 44%; margin-left: auto; }
.gks-fbt__skeleton--3 { width: 66%; }
@keyframes gks-fbt-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .gks-fbt__skeleton { animation: none; } }

.gks-fbt__foot {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-4) var(--sp-6) var(--sp-5);
  border-top: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-fbt__window {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: var(--fs-micro);
}
.gks-fbt__window--closed { background: var(--danger-bg); color: var(--danger-fg); }

.gks-fbt__box {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-2);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  transition: var(--transition-control), box-shadow var(--dur-fast) var(--ease-standard);
}
.gks-fbt__box:focus-within { border-color: var(--line-accent); box-shadow: 0 0 0 3px var(--brand-050); }
.gks-fbt__box--disabled { background: var(--surface-sunken); }

.gks-fbt__field {
  flex: 1;
  min-width: 0;
  max-height: 180px;
  padding: var(--sp-2);
  border: 0;
  outline: none;
  resize: vertical;
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-body);
}
.gks-fbt__field::placeholder { color: var(--text-subtle); }
.gks-fbt__field:focus-visible { box-shadow: none; }

.gks-fbt__send {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--radius-2);
  background: var(--brand-600);
  color: var(--text-inverse);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-fbt__send:hover:not(:disabled) { background: var(--brand-700); }
.gks-fbt__send:disabled { background: var(--n-200); color: var(--n-500); cursor: not-allowed; }
.gks-fbt__spin { animation: gks-fbt-spin 900ms linear infinite; }
@keyframes gks-fbt-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gks-fbt__spin { animation: none; } }

.gks-fbt__hint { padding: 0 var(--sp-2); font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-fbt__hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 4px;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: 4px;
  background: var(--surface-sunken);
}

@media (max-width: 1100px) {
  .gks-fbt__back { display: inline-flex; }
  .gks-fbt__bar { flex-wrap: wrap; padding: var(--sp-3) var(--gutter-mobile); }
  .gks-fbt__actions { width: 100%; justify-content: flex-start; }
  .gks-fbt__note { padding: var(--sp-2) var(--gutter-mobile); }
  .gks-fbt__info { grid-template-columns: 1fr; padding: var(--sp-3) var(--gutter-mobile); }
}

@media (max-width: 640px) {
  .gks-fbt__scroll { padding: var(--sp-3) var(--gutter-mobile) var(--sp-5); }
  .gks-fbt__foot { padding: var(--sp-3) var(--gutter-mobile) var(--sp-4); }
  .gks-fbt__keys { display: none; }
}
.gks-fbt__delete { margin-top: var(--sp-3); color: var(--red-700); }
</style>
