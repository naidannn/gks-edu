<script setup lang="ts">
import type {
  AiAdminChannelFilter,
  AiAdminPeopleResponse,
  AiAdminPersonRow,
  AiAdminSessionCounts,
  AiAdminSessionDetail,
  AiAdminSessionItem,
  AiAdminSessionListResponse,
  AiAdminSessionScope,
} from '@gks/shared';

/**
 * `/admin/ai/sessions` — the assistant's conversations (2E-04).
 *
 * Its own screen, apart from `/admin/messages` (people writing to people) and
 * `/admin/facebook` (the Page's inbox). The questions asked here are different:
 * *who is talking to the assistant right now*, *who has talked to it*, *which
 * answers did people dislike*, *which conversations became an enquiry*. So the
 * list opens on everything, newest first, with "Яг одоо" one tab away, and a
 * second view groups the same conversations by person.
 *
 * Read-only: the assistant has no inbox to answer from. A conversation worth a
 * call links straight to the client or the lead it belongs to.
 *
 * Polls — the list every 15 seconds, an open live conversation every 8 — and
 * stops while the browser tab is hidden. Nothing pushes chat turns to staff.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'AI чатууд — CRM' });

const api = useApi();
const route = useRoute();
const router = useRouter();

type Mode = 'sessions' | 'people';

const SCOPES: { value: AiAdminSessionScope; label: string; icon: string; count: keyof AiAdminSessionCounts }[] = [
  { value: 'ALL', label: 'Бүгд', icon: 'messages-square', count: 'all' },
  { value: 'LIVE', label: 'Яг одоо', icon: 'radio', count: 'live' },
  { value: 'USERS', label: 'Бүртгэлтэй', icon: 'user-round-check', count: 'users' },
  { value: 'GUESTS', label: 'Зочин', icon: 'user-round', count: 'guests' },
  { value: 'LEADS', label: 'Сэжим үүссэн', icon: 'target', count: 'leads' },
  { value: 'DISLIKED', label: '👎 Дургүй', icon: 'thumbs-down', count: 'disliked' },
];

const CHANNELS: { value: AiAdminChannelFilter; label: string }[] = [
  { value: 'WEB', label: 'Вебсайт + Миний булан' },
  { value: 'WEB_WIDGET', label: 'Зөвхөн вебсайт' },
  { value: 'PORTAL', label: 'Зөвхөн Миний булан' },
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'ALL', label: 'Бүх суваг' },
];

const mode = ref<Mode>(route.query.view === 'people' ? 'people' : 'sessions');
const scope = ref<AiAdminSessionScope>('ALL');
const channel = ref<AiAdminChannelFilter>('WEB');
const search = ref('');
const page = ref(1);
/** One person's conversations, chosen from the people view. */
const person = ref<{ userId?: string; anonymousId?: string; label: string } | null>(null);

const items = ref<AiAdminSessionItem[]>([]);
const total = ref(0);
const counts = ref<AiAdminSessionCounts>({ all: 0, live: 0, users: 0, guests: 0, leads: 0, disliked: 0 });
const listPending = ref(true);
const listError = ref<string | null>(null);

const peopleKind = ref<'USERS' | 'GUESTS'>('USERS');
const people = ref<AiAdminPersonRow[]>([]);
const peopleTotal = ref(0);
const peoplePage = ref(1);
const peoplePending = ref(false);

const activeId = ref<string | null>(typeof route.query.session === 'string' ? route.query.session : null);
const active = ref<AiAdminSessionDetail | null>(null);
const detailPending = ref(false);
const detailError = ref<string | null>(null);
const mobilePane = ref<'list' | 'detail'>(activeId.value ? 'detail' : 'list');

const PAGE_SIZE = 50;

// ── Loading ──────────────────────────────────────────────────────────────────

let generation = 0;

async function loadList(options: { quiet?: boolean } = {}): Promise<void> {
  const mine = options.quiet ? generation : ++generation;
  if (!options.quiet) {
    listPending.value = true;
    listError.value = null;
  }
  try {
    const result = await api.get<AiAdminSessionListResponse>('/admin/ai/sessions', {
      query: {
        scope: scope.value,
        channel: channel.value,
        page: page.value,
        limit: PAGE_SIZE,
        ...(search.value.trim() ? { q: search.value.trim() } : {}),
        ...(person.value?.userId ? { userId: person.value.userId } : {}),
        ...(person.value?.anonymousId ? { anonymousId: person.value.anonymousId } : {}),
      },
    });
    if (mine !== generation) return;
    items.value = result.items;
    total.value = result.meta.total;
    counts.value = result.counts;
  } catch (e) {
    // A failed poll keeps the last good list; only a load somebody asked for says so.
    if (!options.quiet) listError.value = apiErrorMessage(e, 'Чатын жагсаалтыг ачаалж чадсангүй');
  } finally {
    if (!options.quiet && mine === generation) listPending.value = false;
  }
}

async function loadPeople(): Promise<void> {
  peoplePending.value = true;
  try {
    const result = await api.get<AiAdminPeopleResponse>('/admin/ai/people', {
      query: {
        kind: peopleKind.value,
        channel: channel.value,
        page: peoplePage.value,
        limit: PAGE_SIZE,
        ...(search.value.trim() ? { q: search.value.trim() } : {}),
      },
    });
    people.value = result.items;
    peopleTotal.value = result.meta.total;
  } catch (e) {
    listError.value = apiErrorMessage(e, 'Жагсаалтыг ачаалж чадсангүй');
  } finally {
    peoplePending.value = false;
  }
}

async function loadDetail(id: string, options: { quiet?: boolean } = {}): Promise<void> {
  if (!options.quiet) {
    detailPending.value = true;
    detailError.value = null;
  }
  try {
    const result = await api.get<AiAdminSessionDetail>(`/admin/ai/sessions/${id}`);
    if (activeId.value === id) active.value = result;
  } catch (e) {
    if (!options.quiet) detailError.value = apiErrorMessage(e, 'Яриаг ачаалж чадсангүй');
  } finally {
    if (!options.quiet) detailPending.value = false;
  }
}

function openSession(id: string): void {
  activeId.value = id;
  mobilePane.value = 'detail';
  void router.replace({ query: { ...route.query, session: id } });
  void loadDetail(id);
}

function reload(): void {
  page.value = 1;
  if (mode.value === 'people') void loadPeople();
  else void loadList();
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    peoplePage.value = 1;
    reload();
  }, 300);
});
watch([scope, channel], reload);
watch(peopleKind, () => {
  peoplePage.value = 1;
  void loadPeople();
});
watch(page, () => void loadList());
watch(peoplePage, () => void loadPeople());

function setMode(next: Mode): void {
  mode.value = next;
  void router.replace({ query: { ...route.query, view: next === 'people' ? 'people' : undefined } });
  reload();
}

/** From the people view: that person's conversations, newest first. */
function pickPerson(row: AiAdminPersonRow): void {
  person.value = row.user
    ? { userId: row.user.id, label: row.user.name || row.user.email || 'Хэрэглэгч' }
    : { anonymousId: row.anonymousId ?? undefined, label: `Зочин #${(row.anonymousId ?? '').slice(0, 6)}` };
  scope.value = 'ALL';
  mode.value = 'sessions';
  search.value = '';
  void router.replace({ query: { ...route.query, view: undefined } });
  page.value = 1;
  void loadList();
}

function clearPerson(): void {
  person.value = null;
  page.value = 1;
  void loadList();
}

// ── Polling ──────────────────────────────────────────────────────────────────

let listTimer: ReturnType<typeof setInterval> | null = null;
let detailTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  if (mode.value === 'people') void loadPeople();
  void loadList();
  if (activeId.value) void loadDetail(activeId.value);

  listTimer = setInterval(() => {
    if (document.hidden || mode.value !== 'sessions') return;
    void loadList({ quiet: true });
  }, 15_000);
  detailTimer = setInterval(() => {
    if (document.hidden || !activeId.value || !active.value?.live) return;
    void loadDetail(activeId.value, { quiet: true });
  }, 8_000);
});

onBeforeUnmount(() => {
  if (listTimer) clearInterval(listTimer);
  if (detailTimer) clearInterval(detailTimer);
  if (searchTimer) clearTimeout(searchTimer);
});

// ── Row helpers ──────────────────────────────────────────────────────────────

function whoOf(item: AiAdminSessionItem): string {
  if (item.user) return item.user.name || item.user.email || item.user.phone || 'Нэргүй хэрэглэгч';
  const leadName = item.lead ? `${item.lead.lastName} ${item.lead.firstName}`.trim() : '';
  // A lead the assistant captured from a phone number alone has placeholder names.
  if (/\p{L}/u.test(leadName)) return leadName;
  // Sessions from before the widget kept a browser id carry only their code.
  return item.anonymousId ? `Зочин #${item.anonymousId.slice(0, 6)}` : `Зочин · ${item.code}`;
}

function initialOf(name: string): string {
  return name.startsWith('Зочин') ? '?' : name.trim().slice(0, 1).toUpperCase();
}

const pages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
const peoplePages = computed(() => Math.max(1, Math.ceil(peopleTotal.value / PAGE_SIZE)));
</script>

<template>
  <div class="ai-inbox">
    <header class="ai-inbox__bar">
      <div class="ai-inbox__title">
        <span class="ai-inbox__mark" aria-hidden="true"><DsIcon name="sparkles" :size="16" /></span>
        <h1>AI чатууд</h1>
        <span v-if="counts.live" class="ai-inbox__live-count"><i /> {{ counts.live }} яг одоо</span>
      </div>
      <div class="ai-inbox__modes" role="tablist">
        <button
          type="button"
          role="tab"
          class="ai-inbox__mode"
          :class="{ 'ai-inbox__mode--on': mode === 'sessions' }"
          :aria-selected="mode === 'sessions'"
          @click="setMode('sessions')"
        >
          <DsIcon name="messages-square" :size="15" /> Яриагаар
        </button>
        <button
          type="button"
          role="tab"
          class="ai-inbox__mode"
          :class="{ 'ai-inbox__mode--on': mode === 'people' }"
          :aria-selected="mode === 'people'"
          @click="setMode('people')"
        >
          <DsIcon name="users" :size="15" /> Хүнээр
        </button>
      </div>
      <NuxtLink to="/admin/ai/settings" class="ai-inbox__settings">
        <DsIcon name="sliders-horizontal" :size="15" /> Тохиргоо
      </NuxtLink>
    </header>

    <div class="ai-inbox__main" :class="`ai-inbox__main--${mobilePane}`">
      <section class="ai-inbox__list" aria-label="Жагсаалт">
        <div class="ai-inbox__filters">
          <DsInput v-model="search" label="Хайх" placeholder="Нэр, утас, имэйл, код, ярианы үг…" icon-left="search" />
          <DsSelect v-model="channel" label="Суваг" :options="CHANNELS" />

          <div v-if="mode === 'sessions'" class="ai-inbox__scopes">
            <button
              v-for="item in SCOPES"
              :key="item.value"
              type="button"
              class="ai-inbox__scope"
              :class="{ 'ai-inbox__scope--on': scope === item.value, 'ai-inbox__scope--live': item.value === 'LIVE' && counts.live }"
              @click="scope = item.value"
            >
              {{ item.label }}
              <span class="gks-tnum">{{ counts[item.count] }}</span>
            </button>
          </div>
          <div v-else class="ai-inbox__scopes">
            <button
              type="button"
              class="ai-inbox__scope"
              :class="{ 'ai-inbox__scope--on': peopleKind === 'USERS' }"
              @click="peopleKind = 'USERS'"
            >
              Бүртгэлтэй хэрэглэгч
            </button>
            <button
              type="button"
              class="ai-inbox__scope"
              :class="{ 'ai-inbox__scope--on': peopleKind === 'GUESTS' }"
              @click="peopleKind = 'GUESTS'"
            >
              Зочин (хөтчөөр)
            </button>
          </div>

          <p v-if="person && mode === 'sessions'" class="ai-inbox__person">
            <DsIcon name="user-round" :size="14" />
            <span>{{ person.label }}-ийн яриа</span>
            <button type="button" aria-label="Шүүлтүүр арилгах" @click="clearPerson"><DsIcon name="x" :size="14" /></button>
          </p>
        </div>

        <p v-if="listError" class="ai-inbox__error">{{ listError }}</p>

        <!-- Conversations -->
        <div v-if="mode === 'sessions'" class="ai-inbox__scroll">
          <div v-if="listPending && !items.length" class="ai-inbox__skeleton">
            <div v-for="n in 6" :key="n" />
          </div>
          <p v-else-if="!items.length" class="ai-inbox__empty">Энэ шүүлтүүрт яриа алга.</p>
          <button
            v-for="item in items"
            :key="item.id"
            type="button"
            class="ai-row"
            :class="{ 'ai-row--on': item.id === activeId }"
            @click="openSession(item.id)"
          >
            <span class="ai-row__avatar" :class="{ 'ai-row__avatar--guest': !item.user }">
              {{ initialOf(whoOf(item)) }}
              <i v-if="item.live" class="ai-row__live" aria-label="Яг одоо" />
            </span>
            <span class="ai-row__body">
              <span class="ai-row__top">
                <strong>{{ whoOf(item) }}</strong>
                <time class="gks-tnum">{{ formatRelativeMn(item.lastMessageAt) }}</time>
              </span>
              <span class="ai-row__title">{{ item.title || '—' }}</span>
              <span class="ai-row__chips">
                <span class="ai-chip">{{ AI_SESSION_CHANNEL_LABELS[item.channel] }}</span>
                <span class="ai-chip gks-tnum">{{ item.questions }} асуулт</span>
                <span v-if="item.lead" class="ai-chip ai-chip--lead">Сэжим</span>
                <span v-if="item.user?.client" class="ai-chip ai-chip--client">{{ item.user.client.code }}</span>
                <span v-if="item.feedback.down" class="ai-chip ai-chip--down">👎 {{ item.feedback.down }}</span>
                <span v-if="item.status === 'HANDED_OFF'" class="ai-chip">Зөвлөхөд</span>
              </span>
            </span>
          </button>
          <DsPager v-if="pages > 1" v-model:page="page" :total-pages="pages" class="ai-inbox__pager" />
        </div>

        <!-- People -->
        <div v-else class="ai-inbox__scroll">
          <div v-if="peoplePending && !people.length" class="ai-inbox__skeleton">
            <div v-for="n in 6" :key="n" />
          </div>
          <p v-else-if="!people.length" class="ai-inbox__empty">Хэн ч чатлаагүй байна.</p>
          <button
            v-for="row in people"
            :key="row.user?.id ?? row.anonymousId ?? ''"
            type="button"
            class="ai-row"
            @click="pickPerson(row)"
          >
            <span class="ai-row__avatar" :class="{ 'ai-row__avatar--guest': !row.user }">
              {{ row.user ? initialOf(row.user.name || row.user.email || '?') : '?' }}
            </span>
            <span class="ai-row__body">
              <span class="ai-row__top">
                <strong>{{ row.user ? (row.user.name || row.user.email || 'Нэргүй') : `Зочин #${(row.anonymousId ?? '').slice(0, 6)}` }}</strong>
                <time class="gks-tnum">{{ formatRelativeMn(row.lastChatAt) }}</time>
              </span>
              <span v-if="row.user" class="ai-row__title">
                {{ [row.user.email, row.user.phone].filter(Boolean).join(' · ') || '—' }}
              </span>
              <span class="ai-row__chips">
                <span class="ai-chip gks-tnum">{{ row.sessions }} яриа</span>
                <span class="ai-chip gks-tnum">{{ Math.ceil(row.messages / 2) }} асуулт</span>
                <span v-if="row.user?.client" class="ai-chip ai-chip--client">{{ row.user.client.code }}</span>
                <span class="ai-chip gks-tnum">Анх {{ formatNumericDate(row.firstChatAt) }}</span>
              </span>
            </span>
          </button>
          <DsPager v-if="peoplePages > 1" v-model:page="peoplePage" :total-pages="peoplePages" class="ai-inbox__pager" />
        </div>
      </section>

      <section class="ai-inbox__detail" aria-label="Яриа">
        <AdminAiSessionDetail
          v-if="active && active.id === activeId"
          :session="active"
          @open="openSession"
          @back="mobilePane = 'list'"
        />
        <div v-else-if="detailPending" class="ai-inbox__placeholder">Ачаалж байна…</div>
        <p v-else-if="detailError" class="ai-inbox__placeholder">{{ detailError }}</p>
        <div v-else class="ai-inbox__placeholder">
          <DsIcon name="messages-square" :size="32" light />
          <p>Зүүн талаас яриа сонгоно уу.</p>
          <p class="ai-inbox__hint">
            Ногоон цэг — хүн яг одоо AI-тай ярьж байна. Хэрэглэгч бүртгэлтэй бол нэр нь, зочин бол хөтчийн дугаар харагдана.
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ai-inbox {
  display: flex;
  flex-direction: column;
  /* The CRM shell's topbar is 56px; the inbox owns the rest of the viewport. */
  height: calc(100vh - 56px);
  min-height: 0;
  margin: calc(var(--sp-6) * -1);
  background: var(--surface-card);
}

.ai-inbox__bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-height: 56px;
  padding: 0 var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.ai-inbox__title { display: flex; align-items: center; gap: var(--sp-2); flex: 1; min-width: 0; }
.ai-inbox__title h1 { font-size: var(--fs-body); font-weight: var(--fw-bold); color: var(--text-strong); }
.ai-inbox__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-1);
  background: linear-gradient(135deg, var(--brand-500), #7c3aed);
  color: var(--text-inverse);
}
.ai-inbox__live-count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  background: var(--success-bg);
  color: var(--success-fg);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
}
.ai-inbox__live-count i,
.ai-row__live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--green-600);
  animation: ai-pulse 1.6s ease-in-out infinite;
}
@keyframes ai-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, .45); }
  50% { box-shadow: 0 0 0 4px rgba(22, 163, 74, 0); }
}
@media (prefers-reduced-motion: reduce) {
  .ai-inbox__live-count i, .ai-row__live { animation: none; }
}

.ai-inbox__modes { display: flex; gap: 2px; padding: 3px; border-radius: var(--radius-2); background: var(--surface-wash); }
.ai-inbox__mode {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 0;
  border-radius: var(--radius-1);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ai-inbox__mode--on { background: var(--surface-card); color: var(--text-strong); box-shadow: 0 1px 2px rgba(0, 0, 0, .08); }
.ai-inbox__settings { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-label); color: var(--text-muted); }
.ai-inbox__settings:hover { color: var(--brand-600); }

.ai-inbox__main { flex: 1; min-height: 0; display: grid; grid-template-columns: 380px minmax(0, 1fr); }

.ai-inbox__list { display: flex; flex-direction: column; min-height: 0; border-right: var(--border-hair) solid var(--line-hairline); }
.ai-inbox__filters {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.ai-inbox__scopes { display: flex; flex-wrap: wrap; gap: var(--sp-1); }
.ai-inbox__scope {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-body);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  cursor: pointer;
}
.ai-inbox__scope span { color: var(--text-muted); }
.ai-inbox__scope--on { border-color: var(--brand-600); background: var(--brand-600); color: var(--text-inverse); }
.ai-inbox__scope--on span { color: var(--brand-100); }
.ai-inbox__scope--live:not(.ai-inbox__scope--on) { border-color: var(--green-600); color: var(--green-700); }
.ai-inbox__person {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-2);
  background: var(--brand-050);
  color: var(--brand-800);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
}
.ai-inbox__person span { flex: 1; }
.ai-inbox__person button { border: 0; background: none; color: inherit; cursor: pointer; display: inline-flex; }

.ai-inbox__scroll { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: thin; }
.ai-inbox__error { padding: var(--sp-3) var(--sp-4); background: var(--danger-bg); color: var(--danger-fg); font-size: var(--fs-caption); }
.ai-inbox__empty { padding: var(--sp-8) var(--sp-4); text-align: center; color: var(--text-muted); font-size: var(--fs-body-sm); }
.ai-inbox__skeleton { display: flex; flex-direction: column; gap: 1px; }
.ai-inbox__skeleton div { height: 76px; background: linear-gradient(90deg, var(--surface-wash), var(--surface-card), var(--surface-wash)); }
.ai-inbox__pager { padding: var(--sp-3); }

.ai-row {
  display: flex;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border: 0;
  border-bottom: var(--border-hair) solid var(--line-soft);
  background: var(--surface-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ai-row:hover { background: var(--surface-hover); }
.ai-row--on { background: var(--brand-050); box-shadow: inset 3px 0 0 var(--brand-600); }
.ai-row__avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 50%;
  background: var(--brand-100);
  color: var(--brand-800);
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
}
.ai-row__avatar--guest { background: var(--surface-wash); color: var(--text-muted); }
.ai-row__live { position: absolute; right: -1px; bottom: -1px; border: 2px solid var(--surface-card); width: 12px; height: 12px; }
.ai-row__body { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.ai-row__top { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.ai-row__top strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-body-sm); color: var(--text-strong); }
.ai-row__top time { flex: none; font-size: 11px; color: var(--text-muted); }
.ai-row__title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-caption); color: var(--text-body); }
.ai-row__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.ai-chip {
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--surface-wash);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: var(--fw-medium);
}
.ai-chip--lead { background: var(--warning-bg); color: var(--warning-fg); }
.ai-chip--client { background: var(--brand-100); color: var(--brand-800); }
.ai-chip--down { background: var(--danger-bg); color: var(--danger-fg); }

.ai-inbox__detail { min-height: 0; min-width: 0; }
.ai-inbox__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  height: 100%;
  padding: var(--sp-6);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  text-align: center;
}
.ai-inbox__hint { max-width: 40ch; font-size: var(--fs-caption); }

@media (max-width: 900px) {
  .ai-inbox__main { grid-template-columns: minmax(0, 1fr); }
  .ai-inbox__main--list .ai-inbox__detail { display: none; }
  .ai-inbox__main--detail .ai-inbox__list { display: none; }
  .ai-inbox__bar { flex-wrap: wrap; padding: var(--sp-2) var(--sp-3); }
  .ai-inbox__settings { display: none; }
}
</style>
