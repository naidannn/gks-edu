<script setup lang="ts">
import type { FacebookCommentItem, FacebookCommentListResponse, FacebookCommentStatus } from '@gks/shared';

/**
 * Comments under the Page's posts (2F).
 *
 * A comment is public, so the assistant does not argue in it: when comments are
 * switched on it answers privately in Messenger and leaves one fixed line under
 * the comment. What is left for a person is the rest — the question it could
 * not take, the complaint, the one it failed to send. Each card offers the
 * three things to do about it: answer in public, answer privately (Meta allows
 * one private reply per comment, so it disappears once used), or let it be.
 */
const emit = defineEmits<{ openThread: [id: string]; changed: [] }>();

const api = useApi();

type Filter = FacebookCommentStatus | '';
const FILTERS: Filter[] = ['', 'NEW', 'FAILED', 'AI_REPLIED', 'STAFF_REPLIED', 'IGNORED'];
const PAGE_SIZE = 50;

const filter = ref<Filter>('');
const page = ref(1);
const items = ref<FacebookCommentItem[]>([]);
const total = ref(0);
const pending = ref(true);
const error = ref<string | null>(null);

/** One reply box open at a time, and which kind it is. */
const replying = ref<{ id: string; private: boolean } | null>(null);
const replyText = ref('');
const busyId = ref<string | null>(null);
const actionError = ref<{ id: string; text: string } | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

async function load(options: { quiet?: boolean } = {}): Promise<void> {
  if (!options.quiet) {
    pending.value = true;
    error.value = null;
  }
  try {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE) });
    if (filter.value) params.set('status', filter.value);
    const result = await api.get<FacebookCommentListResponse>(`/admin/facebook/comments?${params}`);
    items.value = result.items;
    total.value = result.total;
  } catch (e) {
    // A background poll that fails leaves the cards alone; only a load the
    // person asked for says so — an empty list would read as "nothing to do".
    if (!options.quiet) error.value = apiErrorMessage(e, 'Сэтгэгдлүүдийг ачаалж чадсангүй');
    else throw e;
  } finally {
    if (!options.quiet) pending.value = false;
  }
}

watch(filter, () => {
  page.value = 1;
  void load();
});
watch(page, () => void load());

onMounted(() => void load());
// Paused while a reply is being typed: re-rendering the card under the cursor
// is harmless, but a status flip could move it out of the filter mid-sentence.
useVisiblePolling(async () => {
  if (!replying.value) await load({ quiet: true });
}, 15_000);

function openReply(comment: FacebookCommentItem, isPrivate: boolean): void {
  replying.value = { id: comment.id, private: isPrivate };
  replyText.value = '';
  actionError.value = null;
}

function replace(next: FacebookCommentItem): void {
  items.value = items.value.map((item) => (item.id === next.id ? next : item));
  emit('changed');
}

async function sendReply(comment: FacebookCommentItem): Promise<void> {
  const box = replying.value;
  const text = replyText.value.trim();
  if (!box || !text) return;
  busyId.value = comment.id;
  actionError.value = null;
  try {
    replace(
      await api.post<FacebookCommentItem>(`/admin/facebook/comments/${comment.id}/reply`, {
        text,
        private: box.private,
      }),
    );
    replying.value = null;
    replyText.value = '';
  } catch (e) {
    actionError.value = { id: comment.id, text: apiErrorMessage(e, 'Хариу илгээж чадсангүй') };
  } finally {
    busyId.value = null;
  }
}

async function ignore(comment: FacebookCommentItem): Promise<void> {
  busyId.value = comment.id;
  actionError.value = null;
  try {
    replace(await api.patch<FacebookCommentItem>(`/admin/facebook/comments/${comment.id}/ignore`));
  } catch (e) {
    actionError.value = { id: comment.id, text: apiErrorMessage(e, 'Алгасаж чадсангүй') };
  } finally {
    busyId.value = null;
  }
}

/** Enough of the post to recognise it; the permalink is there for the rest. */
function excerpt(text: string | null): string {
  if (!text) return 'Текстгүй пост';
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 140)}…` : flat;
}
</script>

<template>
  <div class="gks-fbc">
    <div class="gks-fbc__filters" role="tablist">
      <button
        v-for="value in FILTERS"
        :key="value || 'ALL'"
        type="button"
        role="tab"
        class="gks-fbc__filter"
        :class="{ 'gks-fbc__filter--on': filter === value }"
        :aria-selected="filter === value"
        @click="filter = value"
      >
        {{ value ? FACEBOOK_COMMENT_STATUS_LABELS[value] : 'Бүгд' }}
      </button>
    </div>

    <div class="gks-fbc__scroll">
      <p v-if="error" class="gks-fbc__empty">{{ error }}</p>
      <div v-else-if="pending && !items.length" class="gks-fbc__loading">
        <span v-for="n in 3" :key="n" class="gks-fbc__skeleton" />
      </div>
      <p v-else-if="!items.length" class="gks-fbc__empty">
        {{ filter === 'NEW' ? 'Шинэ сэтгэгдэл алга — бүгдэд хариулсан байна.' : 'Энэ шүүлтүүрт сэтгэгдэл алга.' }}
      </p>

      <ul v-else class="gks-fbc__list" role="list">
        <li v-for="comment in items" :key="comment.id" class="gks-fbc__card">
          <div class="gks-fbc__post">
            <DsIcon name="newspaper" :size="14" />
            <span class="gks-fbc__post-text">{{ excerpt(comment.postMessage) }}</span>
            <a
              v-if="comment.postPermalink"
              :href="comment.postPermalink"
              target="_blank"
              rel="noopener noreferrer"
              class="gks-fbc__post-link"
            >
              Пост харах <DsIcon name="external-link" :size="12" />
            </a>
          </div>

          <div class="gks-fbc__comment">
            <p class="gks-fbc__head">
              <span class="gks-fbc__from">{{ comment.fromName ?? 'Нэргүй' }}</span>
              <span class="gks-fbc__time gks-tnum">{{ formatDayMonthTime(comment.createdAt) }}</span>
              <DsBadge :tone="FACEBOOK_COMMENT_STATUS_TONE[comment.status]">
                {{ FACEBOOK_COMMENT_STATUS_LABELS[comment.status] }}
              </DsBadge>
            </p>
            <p class="gks-fbc__text">{{ comment.text }}</p>
            <p v-if="comment.status === 'FAILED' && comment.error" class="gks-fbc__error">
              <DsIcon name="triangle-alert" :size="13" /> {{ comment.error }}
            </p>
          </div>

          <ul v-if="comment.publicReplyText || comment.privateRepliedAt" class="gks-fbc__replies" role="list">
            <li v-if="comment.publicReplyText">
              <DsIcon name="globe" :size="13" />
              <span>
                <strong>Нийтэд:</strong> {{ comment.publicReplyText }}
                <span v-if="comment.repliedByName" class="gks-fbc__by">— {{ comment.repliedByName }}</span>
              </span>
            </li>
            <li v-if="comment.privateRepliedAt">
              <DsIcon name="lock" :size="13" />
              <span>
                Messenger-ээр хувийн хариу илгээсэн · <span class="gks-tnum">{{ formatDayMonthTime(comment.privateRepliedAt) }}</span>
                <button
                  v-if="comment.threadId"
                  type="button"
                  class="gks-fbc__thread"
                  @click="emit('openThread', comment.threadId)"
                >
                  Чатыг нээх
                </button>
              </span>
            </li>
          </ul>

          <form
            v-if="replying?.id === comment.id"
            class="gks-fbc__reply"
            @submit.prevent="sendReply(comment)"
          >
            <DsTextarea
              v-model="replyText"
              :rows="3"
              :label="replying.private ? 'Messenger-ээр хувийн хариу' : 'Сэтгэгдлийн доор нийтэд хариулах'"
              :hint="replying.private ? 'Meta нэг сэтгэгдэлд нэг л хувийн хариу зөвшөөрдөг.' : 'Хүн бүр харна.'"
              maxlength="2000"
            />
            <div class="gks-fbc__actions">
              <DsButton size="sm" variant="secondary" @click="replying = null">Болих</DsButton>
              <DsButton
                type="submit"
                size="sm"
                variant="accent"
                icon-left="send-horizontal"
                :disabled="!replyText.trim()"
                :loading="busyId === comment.id"
              >
                Илгээх
              </DsButton>
            </div>
          </form>

          <div v-else class="gks-fbc__actions">
            <DsButton size="sm" variant="secondary" icon-left="reply" :disabled="busyId === comment.id" @click="openReply(comment, false)">
              Нийтэд хариулах
            </DsButton>
            <DsButton
              v-if="!comment.privateRepliedAt"
              size="sm"
              variant="secondary"
              icon-left="message-circle-reply"
              :disabled="busyId === comment.id"
              @click="openReply(comment, true)"
            >
              Хувиар хариулах
            </DsButton>
            <DsButton
              v-if="comment.status === 'NEW' || comment.status === 'FAILED'"
              size="sm"
              variant="ghost"
              icon-left="eye-off"
              :loading="busyId === comment.id"
              @click="ignore(comment)"
            >
              Алгасах
            </DsButton>
          </div>

          <p v-if="actionError?.id === comment.id" class="gks-fbc__error" role="alert">{{ actionError.text }}</p>
        </li>
      </ul>

      <DsPager v-model:page="page" :total-pages="totalPages" class="gks-fbc__pager" />
    </div>
  </div>
</template>

<style scoped>
.gks-fbc { display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--surface-page); }

.gks-fbc__filters {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-6);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-fbc__filter {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-3);
  border: var(--border-hair) solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-fbc__filter:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-fbc__filter--on {
  background: var(--surface-inverse);
  border-color: var(--surface-inverse);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}

.gks-fbc__scroll { flex: 1; min-height: 0; overflow-y: auto; padding: var(--sp-5) var(--sp-6); scrollbar-width: thin; }
.gks-fbc__empty { padding: var(--sp-8) var(--sp-5); text-align: center; font-size: var(--fs-body-sm); color: var(--text-subtle); }

.gks-fbc__list { list-style: none; margin: 0 auto; padding: 0; display: flex; flex-direction: column; gap: var(--sp-4); max-width: 820px; }
.gks-fbc__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}

.gks-fbc__post {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding-bottom: var(--sp-3);
  border-bottom: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-fbc__post-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gks-fbc__post-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--brand-600);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
.gks-fbc__post-link:hover { text-decoration: underline; }

.gks-fbc__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
.gks-fbc__from { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-fbc__time { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-fbc__text {
  margin-top: var(--sp-1);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.gks-fbc__replies {
  list-style: none;
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  border-left: var(--border-rail) solid var(--brand-200);
  background: var(--surface-sunken);
  font-size: var(--fs-micro);
  color: var(--text-muted);
}
.gks-fbc__replies li { display: flex; align-items: flex-start; gap: var(--sp-2); }
.gks-fbc__replies li > .gks-icon { margin-top: 2px; }
.gks-fbc__by { color: var(--text-subtle); }
.gks-fbc__thread {
  margin-left: var(--sp-2);
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand-600);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.gks-fbc__reply { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-fbc__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--sp-2); }
.gks-fbc__error {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-micro);
  color: var(--danger-fg);
}

.gks-fbc__pager { margin-top: var(--sp-4); }

.gks-fbc__loading { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 820px; margin: 0 auto; }
.gks-fbc__skeleton {
  height: 140px;
  border-radius: var(--radius-3);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-fbc-shimmer 1.4s ease-in-out infinite;
}
@keyframes gks-fbc-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .gks-fbc__skeleton { animation: none; } }

@media (max-width: 1100px) {
  .gks-fbc__filters { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-fbc__scroll { padding: var(--sp-4) var(--gutter-mobile); }
  .gks-fbc__card { padding: var(--sp-3) var(--sp-4); }
  .gks-fbc__actions { justify-content: flex-start; }
}
</style>
