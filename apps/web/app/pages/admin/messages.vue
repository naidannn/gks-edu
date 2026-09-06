<script setup lang="ts">
import type { ConversationDetail, ConversationListResponse, InboxCounts, UserRole } from '@gks/shared';

/**
 * `/admin/messages` — the shared chat inbox (1K).
 *
 * Built around one question: *what is nobody holding?* An unclaimed thread is
 * the only failure mode that matters here, so it is the default view, it is
 * counted in the sidebar, and its rows are marked in red. Everything else —
 * mine, waiting on us, resolved — is a filter off the same list.
 *
 * Answering claims the thread server-side, so the "Би хариуцъя" button is a
 * convenience for taking one you have not replied to yet, not a step somebody
 * has to remember.
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });
useHead({ title: 'Чат — CRM' });

type Scope = 'UNASSIGNED' | 'MINE' | 'WAITING' | 'OPEN' | 'RESOLVED';

const api = useApi();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const stream = useMessengerStream();
const thread = useMessengerThread();

const conversations = ref<ConversationDetail[]>([]);
const counts = ref<InboxCounts>({ unassigned: 0, mine: 0, waiting: 0, open: 0 });
const staff = ref<{ id: string; name: string | null; email: string | null; role: UserRole }[]>([]);

const scope = ref<Scope>('UNASSIGNED');
const search = ref('');
const listPending = ref(true);
const acting = ref(false);
const mobilePane = ref<'list' | 'thread'>('list');

const activeId = computed(() => thread.conversation.value?.id ?? null);
const active = computed(() => thread.conversation.value);

const TABS: { value: Scope; label: string; count: (c: InboxCounts) => number | null }[] = [
  { value: 'UNASSIGNED', label: 'Хариуцаагүй', count: (c) => c.unassigned },
  { value: 'WAITING', label: 'Хариу хүлээж буй', count: (c) => c.waiting },
  { value: 'MINE', label: 'Миний', count: (c) => c.mine },
  { value: 'OPEN', label: 'Бүх нээлттэй', count: (c) => c.open },
  { value: 'RESOLVED', label: 'Шийдвэрлэсэн', count: () => null },
];

async function loadList(): Promise<void> {
  listPending.value = true;
  try {
    const params = new URLSearchParams({ scope: scope.value, limit: '50' });
    if (search.value.trim()) params.set('search', search.value.trim());

    const [list, next] = await Promise.all([
      api.get<ConversationListResponse & { items: ConversationDetail[] }>(`/admin/conversations?${params}`),
      api.get<InboxCounts>('/admin/conversations/counts'),
    ]);
    conversations.value = list.items;
    counts.value = next;
  } finally {
    listPending.value = false;
  }
}

async function select(id: string): Promise<void> {
  mobilePane.value = 'thread';
  await thread.open(id);
  if (route.query.conversation !== id) {
    await router.replace({ query: { ...route.query, conversation: id } });
  }
}

/** After an action the row's assignee/status changed, so the list is restated. */
async function act(request: Promise<unknown>): Promise<void> {
  acting.value = true;
  try {
    await request;
    await loadList();
  } finally {
    acting.value = false;
  }
}

function claim(): void {
  const id = active.value?.id;
  if (!id) return;
  void act(api.patch(`/admin/conversations/${id}/assign`, { assigneeId: auth.user?.id }));
}

function assignTo(value: string): void {
  const id = active.value?.id;
  if (!id) return;
  void act(api.patch(`/admin/conversations/${id}/assign`, { assigneeId: value || null }));
}

function toggleResolved(): void {
  const conversation = active.value;
  if (!conversation) return;
  const path = conversation.status === 'RESOLVED' ? 'reopen' : 'resolve';
  void act(api.patch(`/admin/conversations/${conversation.id}/${path}`));
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadList(), 300);
});
watch(scope, () => void loadList());

onMounted(async () => {
  stream.connect();
  thread.listen();

  stream.on((event) => {
    // A staff-visible change can move a thread in or out of the current
    // filter, so the counts and the list are both restated rather than
    // patched — the list is one small query and being wrong here is costly.
    if (event.type === 'conversation' || event.type === 'reconnect') void loadList();
  });

  const [, staffList] = await Promise.all([
    loadList(),
    api.get<typeof staff.value>('/admin/conversations/staff'),
  ]);
  staff.value = staffList;

  const requested = typeof route.query.conversation === 'string' ? route.query.conversation : null;
  if (requested) await select(requested);
});

const staffOptions = computed(() => [
  { value: '', label: 'Хариуцагчгүй' },
  ...staff.value.map((row) => ({ value: row.id, label: row.name ?? row.email ?? 'Ажилтан' })),
]);

const responseNote = computed(() => {
  const conversation = active.value;
  if (!conversation) return null;
  if (conversation.firstResponseAt) return null;
  return 'Энэ чатад хараахан хариу өгөөгүй байна.';
});
</script>

<template>
  <div class="gks-inbox" :data-pane="mobilePane">
    <!-- ── Queue ───────────────────────────────────────────────────────── -->
    <aside class="gks-inbox__list">
      <div class="gks-inbox__filters">
        <DsInput
          v-model="search"
          type="search"
          icon-left="search"
          placeholder="Нэр, утас, дугаараар хайх"
          aria-label="Чат хайх"
        />
        <div class="gks-inbox__tabs" role="tablist">
          <button
            v-for="tab in TABS"
            :key="tab.value"
            type="button"
            role="tab"
            class="gks-inbox__tab"
            :class="{ 'gks-inbox__tab--on': scope === tab.value }"
            :aria-selected="scope === tab.value"
            @click="scope = tab.value"
          >
            {{ tab.label }}
            <span
              v-if="tab.count(counts)"
              class="gks-inbox__tab-count gks-tnum"
              :class="{ 'gks-inbox__tab-count--alert': tab.value === 'UNASSIGNED' }"
            >{{ tab.count(counts) }}</span>
          </button>
        </div>
      </div>

      <div class="gks-inbox__list-scroll">
        <MessengerThreadList
          :items="conversations"
          :active-id="activeId"
          :pending="listPending"
          staff
          @select="select"
        >
          <template #empty>
            <p class="gks-inbox__empty">
              {{ scope === 'UNASSIGNED' ? 'Хариуцагчгүй чат алга — бүгд хуваарилагдсан байна.' : 'Энэ шүүлтүүрт чат алга.' }}
            </p>
          </template>
        </MessengerThreadList>
      </div>
    </aside>

    <!-- ── Thread ──────────────────────────────────────────────────────── -->
    <div class="gks-inbox__pane">
      <MessengerThread
        v-if="active || thread.pending.value"
        :conversation="active"
        :messages="thread.messages.value"
        viewer-is-staff
        :pending="thread.pending.value"
        :sending="thread.sending.value"
        :loading-older="thread.loadingOlder.value"
        :has-older="Boolean(thread.nextBefore.value)"
        :is-typing="thread.isTyping.value"
        :typing-name="thread.typingName.value"
        :other-read-at="thread.otherReadAt.value"
        placeholder="Хэрэглэгчид хариу бичих…"
        @send="thread.send"
        @typing="thread.ping"
        @retry="thread.retry"
        @load-older="thread.loadOlder"
        @read="thread.markRead"
      >
        <template #header>
          <div class="gks-inbox__head">
            <button type="button" class="gks-inbox__back" aria-label="Буцах" @click="mobilePane = 'list'">
              <DsIcon name="arrow-left" :size="18" />
            </button>

            <div class="gks-inbox__who">
              <p class="gks-inbox__name">{{ active?.client.name ?? 'Нэргүй хэрэглэгч' }}</p>
              <p class="gks-inbox__meta">
                <span class="gks-tnum">{{ active?.code }}</span>
                <template v-if="active?.client.clientCode">
                  · <NuxtLink :to="`/admin/clients?search=${active.client.clientCode}`" class="gks-tnum">
                    {{ active.client.clientCode }}
                  </NuxtLink>
                </template>
                <template v-if="active?.client.phone"> · <a :href="`tel:${active.client.phone}`" class="gks-tnum">{{ active.client.phone }}</a></template>
                <template v-if="active"> · {{ CONVERSATION_TOPIC_SHORT[active.topic] }}</template>
                <template v-if="active?.caseCode"> · <span class="gks-tnum">{{ active.caseCode }}</span></template>
              </p>
            </div>

            <div class="gks-inbox__actions">
              <DsButton
                v-if="active && !active.assignee"
                size="sm"
                variant="accent"
                icon-left="hand"
                :loading="acting"
                @click="claim"
              >
                Би хариуцъя
              </DsButton>
              <DsSelect
                v-else-if="active"
                :model-value="active.assignee?.id ?? ''"
                :options="staffOptions"
                :disabled="acting"
                aria-label="Хариуцагч"
                class="gks-inbox__assignee"
                @update:model-value="assignTo"
              />
              <DsButton
                size="sm"
                variant="secondary"
                :icon-left="active?.status === 'RESOLVED' ? 'rotate-ccw' : 'check'"
                :loading="acting"
                @click="toggleResolved"
              >
                {{ active?.status === 'RESOLVED' ? 'Дахин нээх' : 'Шийдвэрлэсэн' }}
              </DsButton>
            </div>
          </div>

          <p v-if="responseNote" class="gks-inbox__note">
            <DsIcon name="clock" :size="14" /> {{ responseNote }}
          </p>
        </template>
      </MessengerThread>

      <div v-else class="gks-inbox__blank">
        <DsIcon name="inbox" :size="34" light />
        <p>Зүүн талаас чат сонгоно уу</p>
        <p class="gks-inbox__blank-sub">
          Хариуцагчгүй {{ counts.unassigned }} чат хүлээгдэж байна.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-inbox {
  display: grid;
  grid-template-columns: 360px 1fr;
  /* The CRM shell's topbar is 56px; the inbox owns the rest of the viewport
     so its two panes scroll independently instead of the window scrolling. */
  height: calc(100vh - 56px);
  min-height: 0;
  margin: calc(var(--sp-6) * -1);
  background: var(--surface-card);
}

.gks-inbox__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: var(--border-hair) solid var(--line-hairline);
}

.gks-inbox__filters {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}

.gks-inbox__tabs { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.gks-inbox__tab {
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
.gks-inbox__tab:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-inbox__tab--on {
  background: var(--surface-inverse);
  border-color: var(--surface-inverse);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}
.gks-inbox__tab-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--n-100);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--fw-bold);
}
.gks-inbox__tab-count--alert { background: var(--red-700); color: var(--text-inverse); }
.gks-inbox__tab--on .gks-inbox__tab-count { background: rgba(255, 255, 255, .18); color: var(--text-inverse); }

.gks-inbox__list-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.gks-inbox__empty { padding: var(--sp-8) var(--sp-5); text-align: center; font-size: var(--fs-body-sm); color: var(--text-subtle); }

.gks-inbox__pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; }

.gks-inbox__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 64px;
  padding: var(--sp-3) var(--sp-6);
}
.gks-inbox__who { flex: 1; min-width: 0; }
.gks-inbox__name {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-inbox__meta { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-inbox__meta a { color: var(--text-subtle); text-decoration: none; }
.gks-inbox__meta a:hover { color: var(--brand-600); text-decoration: underline; }

.gks-inbox__actions { display: flex; align-items: center; gap: var(--sp-2); }
.gks-inbox__assignee { min-width: 170px; }

.gks-inbox__note {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-6);
  border-top: var(--border-hair) solid var(--line-soft);
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: var(--fs-micro);
}

.gks-inbox__back {
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

.gks-inbox__blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  background: var(--surface-page);
  color: var(--text-subtle);
  font-size: var(--fs-body-sm);
}
.gks-inbox__blank-sub { font-size: var(--fs-micro); }

@media (max-width: 1100px) {
  .gks-inbox { grid-template-columns: 1fr; }
  .gks-inbox__list { border-right: 0; }
  .gks-inbox__back { display: inline-flex; }
  .gks-inbox__head { flex-wrap: wrap; padding: var(--sp-3) var(--gutter-mobile); }
  .gks-inbox__actions { width: 100%; }

  .gks-inbox[data-pane='list'] .gks-inbox__pane { display: none; }
  .gks-inbox[data-pane='thread'] .gks-inbox__list { display: none; }
}
</style>
