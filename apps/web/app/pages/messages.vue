<script setup lang="ts">
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationListResponse,
  ConversationTopic,
  MessageItem,
} from '@gks/shared';

/**
 * `/messages` — the client's chat with a real consultant (1K).
 *
 * Its own top-level screen rather than a widget in a corner, because this is
 * where a large share of the relationship actually happens: it is the first
 * thing a new account can do, and the thing a client under contract comes back
 * to weekly. A floating bubble would have said the opposite.
 *
 * Two panes on a desktop, one at a time on a phone — the list and the thread
 * are the same two panes either way, so there is one component tree and a
 * breakpoint, not two implementations.
 */
definePageMeta({ middleware: 'auth', layout: 'portal', flush: true });
useHead({ title: 'Зөвлөхтэй чатлах' });

const api = useApi();
const route = useRoute();
const router = useRouter();
const stream = useMessengerStream();
const thread = useMessengerThread();
const { overview, load: loadPortal } = usePortal();

const conversations = ref<ConversationListItem[]>([]);
const listPending = ref(true);
const starting = ref(false);
const startError = ref<string | null>(null);

/** `list` | `thread` | `new` — only meaningful below the breakpoint. */
const mobilePane = ref<'list' | 'thread' | 'new'>('list');
const composingNew = ref(false);

const activeId = computed(() => thread.conversation.value?.id ?? null);
const hasThreads = computed(() => conversations.value.length > 0);

const listError = ref<string | null>(null);

async function loadList(): Promise<void> {
  listPending.value = true;
  listError.value = null;
  try {
    const response = await api.get<ConversationListResponse>('/me/conversations?limit=50');
    conversations.value = response.items;
  } catch (e) {
    // "Танд одоогоор чат алга" for a failed request is a lie the client acts on.
    listError.value = apiErrorMessage(e, 'Чатын жагсаалтыг ачаалж чадсангүй');
  } finally {
    listPending.value = false;
  }
}

async function select(id: string): Promise<void> {
  composingNew.value = false;
  mobilePane.value = 'thread';
  await thread.open(id);
  // Keep the thread in the URL so a refresh, a back button and the link in a
  // notification email all land on the same conversation.
  if (route.query.c !== id) await router.replace({ query: { ...route.query, c: id } });
}

function startNew(): void {
  thread.close();
  composingNew.value = true;
  startError.value = null;
  mobilePane.value = 'new';
  void router.replace({ query: {} });
}

async function submitNew(payload: {
  topic: ConversationTopic;
  subject?: string;
  caseId?: string;
  body: string;
}): Promise<void> {
  starting.value = true;
  startError.value = null;
  try {
    const created = await api.post<{ conversation: ConversationDetail; message: MessageItem }>(
      '/me/conversations',
      payload,
    );
    conversations.value = [created.conversation, ...conversations.value];
    composingNew.value = false;
    await select(created.conversation.id);
  } catch (error) {
    startError.value = apiErrorMessage(error, 'Илгээж чадсангүй. Дахин оролдоно уу.');
  } finally {
    starting.value = false;
  }
}

/** Moves a thread to the top of the list and refreshes its head in place. */
function patchList(next: ConversationListItem): void {
  const rest = conversations.value.filter((item) => item.id !== next.id);
  conversations.value = [next, ...rest];
}

/**
 * The listener set lives on the connection, which outlives this page, so the
 * unsubscribe has to be kept and called — `useMessengerThread` already does.
 * Dropping it left one dead closure per visit, and every conversation event
 * then fired one more inbox reload than the visit before.
 */
let unsubscribe: (() => void) | null = null;
onBeforeUnmount(() => unsubscribe?.());

onMounted(async () => {
  stream.connect();
  thread.listen();

  unsubscribe = stream.on((event) => {
    if (event.type === 'conversation') patchList(event.conversation);
    else if (event.type === 'reconnect') void loadList();
  });

  await Promise.all([loadList(), loadPortal()]);

  const requested = typeof route.query.c === 'string' ? route.query.c : null;
  if (requested) {
    await select(requested);
  } else if (!conversations.value.length) {
    // A brand-new account should land on the box, not on an empty list.
    startNew();
  } else if (window.innerWidth > 900) {
    await select(conversations.value[0]!.id);
  }
});

const assigneeLine = computed(() => {
  const conversation = thread.conversation.value;
  if (!conversation) return '';
  if (conversation.assignee?.name) return `${conversation.assignee.name} хариуцаж байна`;
  return 'Зөвлөх хуваарилагдаж байна…';
});
</script>

<template>
  <div class="gks-messages" :data-pane="mobilePane">
    <!-- ── Threads ─────────────────────────────────────────────────────── -->
    <aside class="gks-messages__list">
      <header class="gks-messages__list-head">
        <div>
          <h1 class="gks-messages__title">Чат</h1>
          <p class="gks-messages__status">
            <span class="gks-messages__dot" :class="{ 'gks-messages__dot--on': stream.connected.value }" />
            {{ stream.connected.value ? 'Шууд холбогдсон' : 'Холболт сэргээж байна…' }}
          </p>
        </div>
        <DsButton size="sm" variant="accent" icon-left="plus" @click="startNew">Шинэ асуулт</DsButton>
      </header>

      <div class="gks-messages__list-scroll">
        <MessengerThreadList
          :items="conversations"
          :active-id="activeId"
          :pending="listPending"
          @select="select"
        >
          <template #empty>
            <div class="gks-messages__list-empty">
              <template v-if="listError">
                <p>{{ listError }}</p>
                <button type="button" class="gks-messages__link" @click="loadList">Дахин оролдох</button>
              </template>
              <template v-else>
                <p>Танд одоогоор чат алга.</p>
                <button type="button" class="gks-messages__link" @click="startNew">Эхний асуултаа бичих</button>
              </template>
            </div>
          </template>
        </MessengerThreadList>
      </div>
    </aside>

    <!-- ── Thread / new question ───────────────────────────────────────── -->
    <div class="gks-messages__pane">
      <div v-if="composingNew" class="gks-messages__new">
        <header class="gks-messages__pane-head">
          <button
            v-if="hasThreads"
            type="button"
            class="gks-messages__back"
            aria-label="Буцах"
            @click="mobilePane = 'list'; composingNew = false"
          >
            <DsIcon name="arrow-left" :size="18" />
          </button>
          <span class="gks-messages__pane-title">Шинэ асуулт</span>
        </header>

        <div class="gks-messages__new-body">
          <DsCard v-if="startError" accent><p>{{ startError }}</p></DsCard>
          <MessengerStartForm
            :cases="overview?.cases ?? []"
            :sending="starting"
            @submit="submitNew"
            @cancel="hasThreads ? (composingNew = false, mobilePane = 'list') : undefined"
          />
        </div>
      </div>

      <MessengerThread
        v-else-if="thread.conversation.value || thread.pending.value"
        :conversation="thread.conversation.value"
        :messages="thread.messages.value"
        :viewer-is-staff="false"
        :pending="thread.pending.value"
        :sending="thread.sending.value"
        :loading-older="thread.loadingOlder.value"
        :has-older="Boolean(thread.nextBefore.value)"
        :is-typing="thread.isTyping.value"
        :typing-name="thread.typingName.value"
        :other-read-at="thread.otherReadAt.value"
        placeholder="Зөвлөхөд бичих…"
        @send="thread.send"
        @typing="thread.ping"
        @retry="thread.retry"
        @load-older="thread.loadOlder"
        @read="thread.markRead"
      >
        <template #header>
          <div class="gks-messages__pane-head">
            <button type="button" class="gks-messages__back" aria-label="Буцах" @click="mobilePane = 'list'">
              <DsIcon name="arrow-left" :size="18" />
            </button>

            <div class="gks-messages__pane-id">
              <p class="gks-messages__pane-title">{{ thread.conversation.value?.subject }}</p>
              <p class="gks-messages__pane-sub">
                {{ assigneeLine }}
                <template v-if="thread.conversation.value">
                  · {{ CONVERSATION_TOPIC_SHORT[thread.conversation.value.topic] }}
                  · <span class="gks-tnum">{{ thread.conversation.value.code }}</span>
                </template>
              </p>
            </div>

            <DsBadge
              v-if="thread.conversation.value?.status === 'RESOLVED'"
              tone="success"
              icon="circle-check"
            >
              Шийдвэрлэсэн
            </DsBadge>
          </div>
        </template>
      </MessengerThread>

      <!-- Desktop only: the list is on screen beside this, so this is the
           "nothing selected yet" state rather than an empty account. -->
      <div v-else class="gks-messages__blank">
        <DsIcon name="messages-square" :size="34" light />
        <p>Зүүн талаас чатаа сонгоно уу</p>
        <DsButton size="sm" variant="secondary" icon-left="plus" @click="startNew">Шинэ асуулт</DsButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-messages {
  display: grid;
  grid-template-columns: 340px 1fr;
  /* Fills the shell's flush main, which is a flex column (see portal.vue). */
  flex: 1;
  min-height: 0;
  background: var(--surface-card);
}

/* ---- List ---- */
.gks-messages__list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}

.gks-messages__list-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-messages__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-messages__status {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 2px;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-messages__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: var(--n-400);
  transition: background-color var(--dur-base) var(--ease-standard);
}
.gks-messages__dot--on { background: var(--green-600); }

.gks-messages__list-scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.gks-messages__list-empty {
  padding: var(--sp-8) var(--sp-5);
  text-align: center;
  font-size: var(--fs-body-sm);
  color: var(--text-subtle);
}
.gks-messages__link {
  margin-top: var(--sp-2);
  border: 0;
  background: none;
  padding: 0;
  color: var(--brand-600);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}

/* ---- Right pane ---- */
.gks-messages__pane { display: flex; flex-direction: column; min-height: 0; min-width: 0; }

.gks-messages__pane-head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 64px;
  padding: var(--sp-3) var(--sp-6);
}
.gks-messages__pane-id { flex: 1; min-width: 0; }
.gks-messages__pane-title {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-messages__pane-sub { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-messages__back {
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
.gks-messages__back:hover { background: var(--surface-hover); color: var(--text-strong); }

.gks-messages__new { display: flex; flex-direction: column; min-height: 0; height: 100%; }
.gks-messages__new .gks-messages__pane-head { border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-messages__new-body { flex: 1; min-height: 0; overflow-y: auto; background: var(--surface-page); }

.gks-messages__blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  background: var(--surface-page);
  color: var(--text-subtle);
  font-size: var(--fs-body-sm);
}

/* ---- One pane at a time ---- */
@media (max-width: 900px) {
  .gks-messages { grid-template-columns: 1fr; }
  .gks-messages__list { border-right: 0; }
  .gks-messages__back { display: inline-flex; }
  .gks-messages__pane-head { padding: var(--sp-3) var(--gutter-mobile); }

  .gks-messages[data-pane='list'] .gks-messages__pane { display: none; }
  .gks-messages[data-pane='thread'] .gks-messages__list,
  .gks-messages[data-pane='new'] .gks-messages__list { display: none; }
}
</style>
