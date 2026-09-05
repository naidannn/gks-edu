<script setup lang="ts">
import type { AdminUniversityRow, ClientListItem } from '@gks/shared';

/**
 * ⌘K — one box that reaches every screen and every client.
 *
 * Staff spend their day moving between a person and a queue. Without this the
 * trip is sidebar → list → filter → search → row; with it, it is the person's
 * name and Enter. Nav items match locally and instantly; clients and
 * universities are fetched, debounced, only once the query is worth a request.
 */

const emit = defineEmits<{ close: [] }>();

const api = useApi();
const router = useRouter();

const q = ref('');
const cursor = ref(0);
const input = ref<HTMLInputElement>();
const listEl = ref<HTMLElement>();

interface Hit {
  key: string;
  to: string;
  label: string;
  sub?: string;
  icon: string;
  group: string;
}

/** Case- and position-insensitive: "элс самбар" finds "Элсэлтийн самбар". */
function matches(haystack: string, needle: string): boolean {
  const words = needle.toLowerCase().split(/\s+/).filter(Boolean);
  const target = haystack.toLowerCase();
  return words.every((word) => target.includes(word));
}

const navHits = computed<Hit[]>(() => {
  const term = q.value.trim();
  const pool = [...ADMIN_NAV_ITEMS, ...ADMIN_QUICK_ACTIONS];
  const items = term
    ? pool.filter((item) => matches(`${item.label} ${item.keywords ?? ''} ${item.to}`, term))
    : ADMIN_NAV_ITEMS;
  return items.map((item) => ({
    key: `nav:${item.to}`,
    to: item.to,
    label: item.label,
    icon: item.icon,
    group: ADMIN_QUICK_ACTIONS.includes(item) ? 'Үйлдэл' : 'Хуудас',
  }));
});

const clientHits = ref<Hit[]>([]);
const uniHits = ref<Hit[]>([]);
const searching = ref(false);

type Page<T> = { items: T[] };

async function search(term: string) {
  if (term.length < 2) {
    clientHits.value = [];
    uniHits.value = [];
    return;
  }
  searching.value = true;
  const [clients, universities] = await Promise.all([
    api.get<Page<ClientListItem>>('/clients', { query: { q: term, limit: 5 } }).catch(() => null),
    api.get<Page<AdminUniversityRow>>('/admin/universities', { query: { q: term, limit: 5 } }).catch(() => null),
  ]);
  clientHits.value = (clients?.items ?? []).map((c) => ({
    key: `client:${c.id}`,
    to: `/admin/clients/${c.id}`,
    label: `${c.lastName} ${c.firstName}`,
    sub: `${c.code} · ${c.phone}`,
    icon: 'user',
    group: 'Үйлчлүүлэгч',
  }));
  uniHits.value = (universities?.items ?? []).map((u) => ({
    key: `uni:${u.id}`,
    to: `/admin/universities/${u.id}`,
    label: u.nameMn,
    sub: u.nameKo || u.nameEn || undefined,
    icon: 'school',
    group: 'Сургууль',
  }));
  searching.value = false;
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(q, (term) => {
  cursor.value = 0;
  clearTimeout(timer);
  timer = setTimeout(() => search(term.trim()), 220);
});
onBeforeUnmount(() => clearTimeout(timer));

const hits = computed(() => [...navHits.value, ...clientHits.value, ...uniHits.value]);

/** Flat list for the keyboard, grouped for the eye. */
const groups = computed(() => {
  const out: { title: string; items: Hit[] }[] = [];
  for (const hit of hits.value) {
    const last = out[out.length - 1];
    if (last && last.title === hit.group) last.items.push(hit);
    else out.push({ title: hit.group, items: [hit] });
  }
  return out;
});

function move(delta: number) {
  const total = hits.value.length;
  if (!total) return;
  cursor.value = (cursor.value + delta + total) % total;
  nextTick(() => {
    listEl.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  });
}

function choose(hit: Hit | undefined) {
  if (!hit) return;
  emit('close');
  router.push(hit.to);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
  else if (event.key === 'Enter') { event.preventDefault(); choose(hits.value[cursor.value]); }
  else if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
}

onMounted(() => nextTick(() => input.value?.focus()));
</script>

<template>
  <div class="gks-palette" role="dialog" aria-modal="true" aria-label="Хурдан хайлт">
    <button type="button" class="gks-palette__scrim" aria-label="Хаах" tabindex="-1" @click="emit('close')" />

    <div class="gks-palette__panel">
      <div class="gks-palette__field">
        <DsIcon name="search" :size="18" />
        <input
          ref="input"
          v-model="q"
          type="text"
          class="gks-palette__input"
          placeholder="Хуудас, үйлчлүүлэгч, сургууль хайх…"
          autocomplete="off"
          spellcheck="false"
          @keydown="onKeydown"
        >
        <DsIcon v-if="searching" name="loader-circle" :size="16" class="gks-palette__spin" />
        <kbd class="gks-kbd">esc</kbd>
      </div>

      <div ref="listEl" class="gks-palette__results">
        <p v-if="!hits.length" class="gks-palette__empty">
          {{ q.trim().length < 2 ? 'Хайх утгаа бичнэ үү.' : 'Юу ч олдсонгүй.' }}
        </p>

        <template v-for="group in groups" :key="group.title">
          <p class="gks-palette__group">{{ group.title }}</p>
          <button
            v-for="hit in group.items"
            :key="hit.key"
            type="button"
            class="gks-palette__hit"
            :data-active="hits[cursor]?.key === hit.key"
            @click="choose(hit)"
            @mousemove="cursor = hits.findIndex((h) => h.key === hit.key)"
          >
            <DsIcon :name="hit.icon" :size="17" />
            <span class="gks-palette__hit-text">
              <span class="gks-palette__hit-label">{{ hit.label }}</span>
              <span v-if="hit.sub" class="gks-palette__hit-sub">{{ hit.sub }}</span>
            </span>
            <DsIcon name="corner-down-left" :size="14" class="gks-palette__enter" />
          </button>
        </template>
      </div>

      <div class="gks-palette__foot">
        <span><kbd class="gks-kbd">↑</kbd><kbd class="gks-kbd">↓</kbd> сонгох</span>
        <span><kbd class="gks-kbd">↵</kbd> нээх</span>
        <span><kbd class="gks-kbd">/</kbd> хуудсан дээрх хайлт</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-palette { position: fixed; inset: 0; z-index: 90; }
.gks-palette__scrim {
  position: absolute;
  inset: 0;
  border: 0;
  padding: 0;
  background: var(--scrim);
  backdrop-filter: var(--blur-scrim);
  cursor: default;
}

.gks-palette__panel {
  position: relative;
  width: min(640px, calc(100vw - var(--sp-6)));
  margin: min(12vh, 96px) auto 0;
  display: flex;
  flex-direction: column;
  max-height: min(560px, 70vh);
  background: var(--surface-card);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-dialog);
  overflow: hidden;
}

.gks-palette__field {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  color: var(--text-subtle);
}
.gks-palette__input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  outline: none;
  font-size: var(--fs-body);
  color: var(--text-strong);
}
.gks-palette__input::placeholder { color: var(--text-subtle); }
.gks-palette__spin { animation: gks-palette-spin 1s linear infinite; }
@keyframes gks-palette-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gks-palette__spin { animation: none; } }

.gks-palette__results { flex: 1; overflow-y: auto; padding: var(--sp-2); overscroll-behavior: contain; }
.gks-palette__empty { padding: var(--sp-7) var(--sp-4); text-align: center; color: var(--text-subtle); font-size: var(--fs-body-sm); }

.gks-palette__group {
  padding: var(--sp-3) var(--sp-3) var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}

.gks-palette__hit {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3);
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-body);
  text-align: left;
  cursor: pointer;
}
.gks-palette__hit[data-active='true'] { background: var(--surface-selected); color: var(--brand-700); }
.gks-palette__hit-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gks-palette__hit-label {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-palette__hit-sub { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-palette__enter { opacity: 0; flex: none; }
.gks-palette__hit[data-active='true'] .gks-palette__enter { opacity: .8; }

.gks-palette__foot {
  display: flex;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-5);
  border-top: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-sunken);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-palette__foot span { display: inline-flex; align-items: center; gap: var(--sp-1); }

@media (max-width: 600px) {
  .gks-palette__panel { margin-top: var(--sp-4); max-height: calc(100vh - var(--sp-8)); }
  .gks-palette__foot { display: none; }
}
</style>
