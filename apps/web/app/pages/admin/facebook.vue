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

type Tab = 'messenger' | 'comments';

const api = useApi();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const SCOPES: { value: FacebookThreadScope; count: (c: FacebookThreadCounts) => number | null }[] = [
  { value: 'NEEDS_STAFF', count: (c) => c.needsStaff },
  { value: 'ALL', count: (c) => c.unread || null },
  { value: 'AI', count: () => null },
  { value: 'UNLINKED', count: (c) => c.unlinked },
];

const status = ref<FacebookStatus | null>(null);
const settingsOpen = ref(false);

const tab = ref<Tab>(route.query.tab === 'comments' ? 'comments' : 'messenger');
const scope = ref<FacebookThreadScope>('NEEDS_STAFF');
const search = ref('');
const threads = ref<FacebookThreadItem[]>([]);
const counts = ref<FacebookThreadCounts>({ needsStaff: 0, unread: 0, unlinked: 0, comments: 0 });
const listPending = ref(true);
const listError = ref<string | null>(null);

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
async function loadList(options: { quiet?: boolean } = {}): Promise<void> {
  if (!options.quiet) {
    listPending.value = true;
    listError.value = null;
  }
  try {
    const params = new URLSearchParams({ scope: scope.value, limit: '50', offset: '0' });
    if (search.value.trim()) params.set('search', search.value.trim());
    const result = await api.get<FacebookThreadListResponse>(`/admin/facebook/threads?${params}`);
    threads.value = result.items;
    counts.value = result.counts;
  } catch (e) {
    if (options.quiet) throw e;
    listError.value = apiErrorMessage(e, 'Чатын жагсаалтыг ачаалж чадсангүй');
  } finally {
    if (!options.quiet) listPending.value = false;
  }
}

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
  void router.replace({ query: { ...route.query, tab: next === 'comments' ? 'comments' : undefined } });
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

        <div class="gks-fb__list-scroll">
          <FacebookThreadList :items="threads" :active-id="activeId" :pending="listPending" @select="select">
            <template #empty>
              <p class="gks-fb__empty">{{ listError ?? emptyText }}</p>
            </template>
          </FacebookThreadList>
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
