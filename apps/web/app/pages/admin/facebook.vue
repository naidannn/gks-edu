<script setup lang="ts">
import type {
  FacebookStatus,
  FacebookThreadCounts,
  FacebookThreadDetail,
  FacebookThreadItem,
  FacebookThreadListResponse,
  FacebookThreadScope,
} from '@gks/shared';

/**
 * `/admin/facebook` — the office's Facebook Page inbox (2F).
 *
 * Separate from `/admin/messages` on purpose. That screen is the portal chat
 * with people who have an account and usually a contract; this one is
 * strangers on Facebook, most of whom the assistant answers on its own. The
 * question here is not "who holds this thread" but *which of these is the
 * assistant not going to answer?* — so that is the default view and the
 * number on the tab.
 *
 * The third tab is the Page's report (2F-10): who wrote, how many left a number, by day.
 *
 * There is no live stream: Meta's webhook lands on the API and nothing pushes
 * it on to the browser. The inbox polls instead — the list every 15 seconds,
 * the open thread every 5 — and stops while the tab is hidden. A Messenger
 * contact waits minutes for a human anyway; seconds of lag cost nothing.
 *
 * Writing here pauses the assistant in that thread (server-side, for
 * `facebookStaffPauseHours`), so a person who takes over is never talked over.
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });
useHead({ title: 'Facebook — CRM' });

type Tab = 'messenger' | 'comments' | 'report';

const api = useApi();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const SCOPES: { value: FacebookThreadScope; count: (c: FacebookThreadCounts) => number | null }[] = [
  { value: 'NEEDS_STAFF', count: (c) => c.needsStaff },
  { value: 'STARRED', count: (c) => c.starred || null },
  { value: 'ALL', count: (c) => c.unread || null },
  { value: 'AI', count: () => null },
  { value: 'UNLINKED', count: (c) => c.unlinked },
];

const status = ref<FacebookStatus | null>(null);
const settingsOpen = ref(false);

const tab = ref<Tab>(route.query.tab === 'comments' || route.query.tab === 'report' ? route.query.tab : 'messenger');
const scope = ref<FacebookThreadScope>('NEEDS_STAFF');
const search = ref('');
const threads = ref<FacebookThreadItem[]>([]);
/** Threads in the current scope and search, of which `threads` holds the newest pages. */
const total = ref(0);
const counts = ref<FacebookThreadCounts>({ needsStaff: 0, unread: 0, unlinked: 0, starred: 0, comments: 0 });
const listPending = ref(true);
const listError = ref<string | null>(null);
const morePending = ref(false);
const moreError = ref<string | null>(null);
/** Bumped by every fresh load, so a page that was in flight for the old scope is dropped. */
let listGeneration = 0;
const hasMore = computed(() => threads.value.length < total.value);

const PAGE_SIZE = 50;

const activeId = ref<string | null>(null);
const active = ref<FacebookThreadDetail | null>(null);
const threadPending = ref(false);
const threadError = ref<string | null>(null);
const mobilePane = ref<'list' | 'thread'>('list');

// ── Loading ──────────────────────────────────────────────────────────────────

/**
 * `quiet` is the poll: it neither flashes the skeleton nor replaces the list
 * with an error. An empty inbox and a failed request look the same, and
 * "nobody needs us" is the expensive one to believe — so only a load somebody
 * asked for reports failure, and a failed poll keeps the last good list.
 */
function listUrl(before?: string): string {
  const params = new URLSearchParams({ scope: scope.value, limit: String(PAGE_SIZE) });
  if (search.value.trim()) params.set('search', search.value.trim());
  if (before) params.set('before', before);
  return `/admin/facebook/threads?${params}`;
}

/**
 * Reloads the first page. A real load starts the list over; the poll keeps
 * whatever was scrolled into view and refreshes only the head — see
 * `mergeHead`.
 */
async function loadList(options: { quiet?: boolean } = {}): Promise<void> {
  const generation = options.quiet ? listGeneration : ++listGeneration;
  if (!options.quiet) {
    listPending.value = true;
    listError.value = null;
    moreError.value = null;
  }
  try {
    const result = await api.get<FacebookThreadListResponse>(listUrl());
    if (generation !== listGeneration) return;
    threads.value = options.quiet ? mergeHead(threads.value, result.items) : result.items;
    total.value = result.total;
    counts.value = result.counts;
    if (!options.quiet) listScroll.value?.scrollTo({ top: 0 });
  } catch (e) {
    if (options.quiet) throw e;
    listError.value = apiErrorMessage(e, 'Чатын жагсаалтыг ачаалж чадсангүй');
  } finally {
    if (!options.quiet && generation === listGeneration) listPending.value = false;
  }
}

/**
 * The poll's first page laid over the rows already loaded. Everything at or
 * after the page's oldest timestamp is the page's to decide — a thread there
 * that the page left out has left the scope (answered, unlinked) — and the
 * older rows the person scrolled to stay until the next real load.
 */
function mergeHead(current: FacebookThreadItem[], head: FacebookThreadItem[]): FacebookThreadItem[] {
  // A short page is the whole scope; there is nothing older to keep.
  if (head.length < PAGE_SIZE) return head;
  const oldest = head[head.length - 1]!.lastMessageAt;
  const ids = new Set(head.map((item) => item.id));
  const tail = current.filter((item) => !ids.has(item.id) && item.lastMessageAt < oldest);
  return [...head, ...tail];
}

/** The next page, older than the last row on screen. */
async function loadMore(): Promise<void> {
  const last = threads.value.at(-1);
  if (!last || morePending.value || listPending.value || !hasMore.value) return;
  const generation = listGeneration;
  morePending.value = true;
  moreError.value = null;
  try {
    const result = await api.get<FacebookThreadListResponse>(listUrl(last.lastMessageAt));
    if (generation !== listGeneration) return;
    const ids = new Set(threads.value.map((item) => item.id));
    const fresh = result.items.filter((item) => !ids.has(item.id));
    threads.value = [...threads.value, ...fresh];
    // A page of nothing but rows we already have means the cursor cannot
    // move; stop asking rather than ask forever.
    total.value = fresh.length ? result.total : threads.value.length;
    counts.value = result.counts;
  } catch (e) {
    if (generation === listGeneration) moreError.value = apiErrorMessage(e, 'Цааш ачаалж чадсангүй');
  } finally {
    if (generation === listGeneration) morePending.value = false;
  }
}

// Infinite scroll: a sentinel under the last row, watched inside the list's
// own scroll box, asks for the next page a little before it comes into view.
const listScroll = ref<HTMLElement | null>(null);
const listEnd = ref<HTMLElement | null>(null);
let endObserver: IntersectionObserver | null = null;

watch([listScroll, listEnd], ([root, end]) => {
  endObserver?.disconnect();
  endObserver = null;
  if (!root || !end) return;
  endObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    },
    { root, rootMargin: '0px 0px 300px 0px' },
  );
  endObserver.observe(end);
});

// A page shorter than the box never scrolls, so the sentinel stays in view and
// the observer does not fire again; ask once more whenever a page lands.
watch(
  () => threads.value.length,
  () => {
    void nextTick(() => {
      const root = listScroll.value;
      if (root && hasMore.value && root.scrollHeight <= root.clientHeight + 300) void loadMore();
    });
  },
);

async function loadThread(id: string, options: { quiet?: boolean } = {}): Promise<void> {
  if (!options.quiet) {
    threadPending.value = true;
    threadError.value = null;
  }
  try {
    const detail = await api.get<FacebookThreadDetail>(`/admin/facebook/threads/${id}`);
    // The person may have clicked another row while this was in flight.
    if (activeId.value !== id) return;
    active.value = detail;
    markReadLocally(id);
  } catch (e) {
    if (options.quiet) throw e;
    if (activeId.value === id) threadError.value = apiErrorMessage(e, 'Чатыг нээж чадсангүй');
  } finally {
    if (!options.quiet && activeId.value === id) threadPending.value = false;
  }
}

/** The read itself happened server-side on GET; the row should not wait 15 s to agree. */
function markReadLocally(id: string): void {
  const row = threads.value.find((item) => item.id === id);
  if (!row?.unreadCount) return;
  counts.value = { ...counts.value, unread: Math.max(0, counts.value.unread - row.unreadCount) };
  threads.value = threads.value.map((item) => (item.id === id ? { ...item, unreadCount: 0 } : item));
}

async function loadStatus(): Promise<void> {
  try {
    status.value = await api.get<FacebookStatus>('/admin/facebook/status');
  } catch {
    // The banner is advice, not a gate: without it the inbox still works.
    status.value = null;
  }
}

// ── Selection ────────────────────────────────────────────────────────────────

async function select(id: string): Promise<void> {
  tab.value = 'messenger';
  mobilePane.value = 'thread';
  if (activeId.value !== id) {
    activeId.value = id;
    active.value = null;
  }
  if (route.query.thread !== id || route.query.tab) {
    await router.replace({ query: { ...route.query, thread: id, tab: undefined } });
  }
  await loadThread(id);
}

/** After a thread failed to open (a stale `?thread=` link, say), back to the queue. */
function closeThread(): void {
  activeId.value = null;
  active.value = null;
  threadError.value = null;
  mobilePane.value = 'list';
  void router.replace({ query: { ...route.query, thread: undefined } });
}

/** A PATCH answered with the new thread state; merge it rather than re-read. */
/**
 * Stars a thread from the list or the pane. Optimistic: the star flips at once
 * and the server's answer is merged back through `onChanged`; a failure puts it
 * back and says why.
 */
async function star(id: string, starred: boolean): Promise<void> {
  const flip = (value: boolean) => {
    threads.value = threads.value.map((item) => (item.id === id ? { ...item, starred: value } : item));
    if (active.value?.id === id) active.value = { ...active.value, starred: value };
  };
  flip(starred);
  try {
    onChanged(await api.patch<FacebookThreadItem>(`/admin/facebook/threads/${id}/star`, { starred }));
  } catch (e) {
    flip(!starred);
    listError.value = apiErrorMessage(e, 'Одоор тэмдэглэж чадсангүй');
  }
}

function onChanged(next: FacebookThreadItem): void {
  if (active.value?.id === next.id) active.value = { ...active.value, ...next };
  threads.value = threads.value.map((item) => (item.id === next.id ? next : item));
  // Linking, pausing or switching the assistant moves a thread between scopes.
  void loadList({ quiet: true }).catch(() => {});
}

function onDeleted(id: string): void {
  threads.value = threads.value.filter((item) => item.id !== id);
  closeThread();
  void loadList({ quiet: true }).catch(() => {});
}

function onRefresh(): void {
  const id = activeId.value;
  if (id) void loadThread(id, { quiet: true }).catch(() => {});
  void loadList({ quiet: true }).catch(() => {});
}

function openTab(next: Tab): void {
  tab.value = next;
  void router.replace({ query: { ...route.query, tab: next === 'messenger' ? undefined : next } });
}

// A link from a comment card, the lead page or the client page changes only
// the query, which does not remount the page.
watch(
  () => route.query.thread,
  (value) => {
    if (typeof value === 'string' && value && value !== activeId.value) void select(value);
  },
);

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadList(), 300);
});
watch(scope, () => void loadList());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  endObserver?.disconnect();
});

onMounted(async () => {
  const requested = typeof route.query.thread === 'string' ? route.query.thread : null;
  await Promise.all([loadList(), loadStatus(), requested ? select(requested) : Promise.resolve()]);
});

useVisiblePolling(() => loadList({ quiet: true }), 15_000);
useVisiblePolling(async () => {
  const id = activeId.value;
  if (id && tab.value === 'messenger') await loadThread(id, { quiet: true });
}, 5_000);

// ── Status and settings ──────────────────────────────────────────────────────

const warnings = computed(() => {
  const value = status.value;
  if (!value) return [];
  const list: { key: string; text: string; tone: 'danger' | 'warning' }[] = [];
  if (!value.configured || value.mock) {
    list.push({ key: 'mock', tone: 'danger', text: 'Page холбогдоогүй — мессеж Facebook руу явахгүй, зөвхөн лог.' });
  }
  if (!value.assistantEnabled) {
    list.push({
      key: 'assistant',
      tone: 'warning',
      text: 'AI туслахын ерөнхий унтраалга унтраалттай — Facebook дээр ч AI хариулахгүй.',
    });
  } else if (!value.facebookEnabled) {
    list.push({ key: 'facebook', tone: 'warning', text: 'Messenger-т AI хариулах тохиргоо унтраалттай.' });
  }
  return list;
});

async function onSettingsSaved(): Promise<void> {
  settingsOpen.value = false;
  await loadStatus();
  onRefresh();
}

const emptyText = computed(() => {
  if (search.value.trim()) return 'Хайлтад тохирох чат алга.';
  if (scope.value === 'NEEDS_STAFF') return 'Ажилтны хариу хүлээж буй чат алга — бусдад AI хариулж байна.';
  if (scope.value === 'UNLINKED') return 'Бүх чат CRM-тэй холбогдсон байна.';
  if (scope.value === 'STARRED') return 'Одоор тэмдэглэсэн чат алга. Жагсаалтын мөр эсвэл чатын толгой дээрх одыг дарж тэмдэглэнэ.';
  return 'Энэ шүүлтүүрт чат алга.';
});
</script>

<template>
  <div class="gks-fb">
    <header class="gks-fb__bar">
      <div class="gks-fb__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="gks-fb__tab"
          :class="{ 'gks-fb__tab--on': tab === 'messenger' }"
          :aria-selected="tab === 'messenger'"
          @click="openTab('messenger')"
        >
          <DsIcon name="message-circle" :size="16" /> Messenger
          <span v-if="counts.needsStaff" class="gks-fb__count gks-tnum">{{ counts.needsStaff }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="gks-fb__tab"
          :class="{ 'gks-fb__tab--on': tab === 'comments' }"
          :aria-selected="tab === 'comments'"
          @click="openTab('comments')"
        >
          <DsIcon name="message-square-text" :size="16" /> Сэтгэгдэл
          <span v-if="counts.comments" class="gks-fb__count gks-tnum">{{ counts.comments }}</span>
        </button>
        <button
          type="button"
          role="tab"
          class="gks-fb__tab"
          :class="{ 'gks-fb__tab--on': tab === 'report' }"
          :aria-selected="tab === 'report'"
          @click="openTab('report')"
        >
          <DsIcon name="chart-column" :size="16" /> Тайлан
        </button>
      </div>

      <DsButton
        v-if="auth.isAdmin && status"
        size="sm"
        :variant="settingsOpen ? 'primary' : 'ghost'"
        icon-left="settings"
        @click="settingsOpen = !settingsOpen"
      >
        Тохиргоо
      </DsButton>
    </header>

    <p v-for="warning in warnings" :key="warning.key" class="gks-fb__warn" :class="`gks-fb__warn--${warning.tone}`">
      <DsIcon name="triangle-alert" :size="14" /> {{ warning.text }}
    </p>

    <FacebookSettings
      v-if="settingsOpen && status && auth.isAdmin"
      :status="status"
      @saved="onSettingsSaved"
      @close="settingsOpen = false"
    />

    <FacebookComments
      v-if="tab === 'comments'"
      @open-thread="select"
      @changed="onRefresh"
    />

    <FacebookStats v-else-if="tab === 'report'" @open-thread="select" />

    <div v-else class="gks-fb__inbox" :data-pane="mobilePane">
      <!-- ── Queue ─────────────────────────────────────────────────────── -->
      <aside class="gks-fb__list">
        <div class="gks-fb__filters">
          <DsInput
            v-model="search"
            type="search"
            icon-left="search"
            placeholder="Нэр, мессежээр хайх"
            aria-label="Facebook чат хайх"
          />
          <div class="gks-fb__scopes" role="tablist">
            <button
              v-for="item in SCOPES"
              :key="item.value"
              type="button"
              role="tab"
              class="gks-fb__scope"
              :class="{ 'gks-fb__scope--on': scope === item.value }"
              :aria-selected="scope === item.value"
              @click="scope = item.value"
            >
              {{ FACEBOOK_SCOPE_LABELS[item.value] }}
              <span
                v-if="item.count(counts)"
                class="gks-fb__scope-count gks-tnum"
                :class="{ 'gks-fb__scope-count--alert': item.value === 'NEEDS_STAFF' }"
              >{{ item.count(counts) }}</span>
            </button>
          </div>
        </div>

        <div ref="listScroll" class="gks-fb__list-scroll">
          <FacebookThreadList
            :items="threads"
            :active-id="activeId"
            :pending="listPending"
            @select="select"
            @star="star"
          >
            <template #empty>
              <p class="gks-fb__empty">{{ listError ?? emptyText }}</p>
            </template>
          </FacebookThreadList>
          <div v-if="threads.length && !listPending" ref="listEnd" class="gks-fb__more">
            <template v-if="moreError">
              <span>{{ moreError }}</span>
              <DsButton size="sm" variant="ghost" icon-left="rotate-cw" @click="loadMore">Дахин оролдох</DsButton>
            </template>
            <span v-else-if="morePending">Ачаалж байна…</span>
            <span v-else-if="hasMore" class="gks-tnum">{{ threads.length }} / {{ total }}</span>
            <span v-else-if="total > PAGE_SIZE" class="gks-tnum">Бүгд харагдаж байна · {{ total }}</span>
          </div>
        </div>
      </aside>

      <!-- ── Thread ────────────────────────────────────────────────────── -->
      <div class="gks-fb__pane">
        <FacebookThreadPane
          v-if="activeId && !threadError"
          :thread="active"
          :pending="threadPending"
          :can-teach="auth.isStaff"
          :can-delete="auth.isAdmin"
          @back="mobilePane = 'list'"
          @changed="onChanged"
          @refresh="onRefresh"
          @deleted="onDeleted"
          @star="star"
        />

        <div v-else class="gks-fb__blank">
          <DsIcon name="facebook" :size="34" light />
          <template v-if="threadError">
            <p>{{ threadError }}</p>
            <DsButton variant="secondary" size="sm" icon-left="arrow-left" @click="closeThread">
              Жагсаалт руу буцах
            </DsButton>
          </template>
          <template v-else>
            <p>Зүүн талаас чат сонгоно уу</p>
            <p class="gks-fb__blank-sub">Ажилтны хариу хүлээж буй {{ counts.needsStaff }} чат байна.</p>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-fb {
  display: flex;
  flex-direction: column;
  /* The CRM shell's topbar is 56px; the inbox owns the rest of the viewport
     so its panes scroll on their own instead of the window scrolling. */
  height: calc(100vh - 56px);
  min-height: 0;
  margin: calc(var(--sp-6) * -1);
  background: var(--surface-card);
}

.gks-fb__bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 0 var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-fb__tabs { display: flex; gap: var(--sp-1); }
.gks-fb__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 48px;
  padding: 0 var(--sp-3);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-fb__tab:hover { color: var(--text-strong); }
.gks-fb__tab--on { border-bottom-color: var(--brand-600); color: var(--text-strong); font-weight: var(--fw-semibold); }
.gks-fb__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--red-700);
  color: var(--text-inverse);
  font-size: 10px;
  font-weight: var(--fw-bold);
  text-align: center;
}

.gks-fb__warn {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
}
.gks-fb__warn--danger { background: var(--danger-bg); color: var(--danger-fg); }
.gks-fb__warn--warning { background: var(--warning-bg); color: var(--warning-fg); }

.gks-fb__inbox {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 360px 1fr;
}

.gks-fb__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: var(--border-hair) solid var(--line-hairline);
}
.gks-fb__filters {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}

.gks-fb__scopes { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.gks-fb__scope {
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
.gks-fb__scope:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-fb__scope--on {
  background: var(--surface-inverse);
  border-color: var(--surface-inverse);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}
.gks-fb__scope-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--n-100);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--fw-bold);
}
.gks-fb__scope-count--alert { background: var(--red-700); color: var(--text-inverse); }
.gks-fb__scope--on .gks-fb__scope-count { background: rgba(255, 255, 255, .18); color: var(--text-inverse); }

.gks-fb__list-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.gks-fb__more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  min-height: 40px;
  padding: var(--sp-2) var(--sp-4);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
}
.gks-fb__empty { padding: var(--sp-8) var(--sp-5); text-align: center; font-size: var(--fs-body-sm); color: var(--text-subtle); }

.gks-fb__pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; }

.gks-fb__blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-5);
  background: var(--surface-page);
  color: var(--text-subtle);
  font-size: var(--fs-body-sm);
  text-align: center;
}
.gks-fb__blank-sub { font-size: var(--fs-micro); }

@media (max-width: 1100px) {
  .gks-fb__bar { padding: 0 var(--gutter-mobile); }
  .gks-fb__warn { padding: var(--sp-2) var(--gutter-mobile); }
  .gks-fb__inbox { grid-template-columns: 1fr; }
  .gks-fb__list { border-right: 0; }

  .gks-fb__inbox[data-pane='list'] .gks-fb__pane { display: none; }
  .gks-fb__inbox[data-pane='thread'] .gks-fb__list { display: none; }
}
</style>
