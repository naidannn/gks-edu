<script setup lang="ts">
import type { FacebookThreadItem } from '@gks/shared';

/**
 * The left column of `/admin/facebook` (2F): one row per Messenger contact.
 *
 * Deliberately its own component rather than a variant of the portal
 * messenger's list. A row here answers different questions — is the assistant
 * still answering this person, is the thread tied to anybody in the CRM, can we
 * still reach them under Meta's window — and folding those into the portal row
 * would have made both harder to read.
 */
const props = defineProps<{
  items: FacebookThreadItem[];
  activeId?: string | null;
  pending?: boolean;
}>();

defineEmits<{ select: [id: string] }>();

/** A picture link from Meta expires; once it 404s the row falls back to initials. */
const brokenPics = ref(new Set<string>());

const rows = computed(() =>
  props.items.map((item) => ({
    item,
    ai: facebookAiState(item),
    pic: item.profilePic && !brokenPics.value.has(item.id) ? item.profilePic : null,
    linked: item.client ? item.client.code : item.lead ? 'Сэжим' : null,
  })),
);

function onPicError(id: string): void {
  brokenPics.value = new Set([...brokenPics.value, id]);
}

const AI_ICON = { ACTIVE: 'bot', PAUSED: 'pause', OFF: 'bot-off', IDLE: 'bot-off' } as const;
</script>

<template>
  <ul v-if="rows.length" class="gks-fbl" role="list">
    <li v-for="row in rows" :key="row.item.id">
      <button
        type="button"
        class="gks-fbl__row"
        :class="{
          'gks-fbl__row--active': row.item.id === activeId,
          'gks-fbl__row--unread': row.item.unreadCount > 0,
        }"
        :aria-current="row.item.id === activeId ? 'true' : undefined"
        @click="$emit('select', row.item.id)"
      >
        <span class="gks-fbl__avatar" :class="{ 'gks-fbl__avatar--alert': row.item.needsStaff }" aria-hidden="true">
          <img v-if="row.pic" :src="row.pic" alt="" loading="lazy" referrerpolicy="no-referrer" @error="onPicError(row.item.id)">
          <template v-else>{{ initials(row.item.name, 'F') }}</template>
        </span>

        <span class="gks-fbl__body">
          <span class="gks-fbl__top">
            <span class="gks-fbl__title">{{ row.item.name ?? 'Нэргүй харилцагч' }}</span>
            <span class="gks-fbl__time gks-tnum">{{ threadTime(row.item.lastMessageAt) }}</span>
          </span>

          <span class="gks-fbl__preview">
            <!-- Whose word was last is what separates "owed a reply" from
                 "waiting on them", so the reply side names itself. -->
            <span v-if="row.item.lastSender && row.item.lastSender !== 'CONTACT'" class="gks-fbl__who">
              {{ row.item.lastSender === 'AI' ? 'AI:' : 'Бид:' }}
            </span>
            {{ row.item.lastMessagePreview ?? '—' }}
          </span>

          <span class="gks-fbl__tags">
            <span v-if="row.item.needsStaff" class="gks-fbl__tag gks-fbl__tag--alert">Ажилтан хэрэгтэй</span>
            <span
              class="gks-fbl__tag"
              :class="`gks-fbl__tag--${FACEBOOK_AI_STATE_TONE[row.ai]}`"
              :title="`AI: ${FACEBOOK_AI_STATE_LABELS[row.ai]}`"
            >
              <DsIcon :name="AI_ICON[row.ai]" :size="11" />
              {{ row.ai === 'PAUSED' ? 'Түр зогссон' : `AI ${FACEBOOK_AI_STATE_LABELS[row.ai].toLowerCase()}` }}
            </span>
            <span v-if="row.linked" class="gks-fbl__tag gks-tnum">{{ row.linked }}</span>
            <span v-else class="gks-fbl__tag gks-fbl__tag--muted">Холбоогүй</span>
            <span v-if="row.item.window === 'CLOSED'" class="gks-fbl__tag gks-fbl__tag--danger">Цонх хаагдсан</span>
          </span>
        </span>

        <span v-if="row.item.unreadCount" class="gks-fbl__badge gks-tnum">{{ row.item.unreadCount }}</span>
      </button>
    </li>
  </ul>

  <div v-else-if="pending" class="gks-fbl__loading">
    <span v-for="n in 4" :key="n" class="gks-fbl__skeleton" />
  </div>

  <slot v-else name="empty" />
</template>

<style scoped>
.gks-fbl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

.gks-fbl__row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: 0;
  border-bottom: var(--border-hair) solid var(--line-soft);
  border-left: var(--border-rail) solid transparent;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-fbl__row:hover { background: var(--surface-hover); }
.gks-fbl__row--active { background: var(--surface-selected); border-left-color: var(--brand-600); }
.gks-fbl__row--active:hover { background: var(--surface-selected); }

.gks-fbl__avatar {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: var(--n-100);
  color: var(--n-600);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
}
.gks-fbl__avatar img { width: 100%; height: 100%; object-fit: cover; }
.gks-fbl__row--unread .gks-fbl__avatar { background: var(--brand-100); color: var(--brand-800); }
/* Nobody is going to answer this one on their own — the state not to scroll past. */
.gks-fbl__avatar--alert { box-shadow: 0 0 0 2px var(--red-700); }

.gks-fbl__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.gks-fbl__top { display: flex; align-items: baseline; gap: var(--sp-2); }
.gks-fbl__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-fbl__time { flex: none; font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-fbl__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-fbl__row--unread .gks-fbl__preview { color: var(--text-body); font-weight: var(--fw-medium); }
.gks-fbl__who { color: var(--text-subtle); font-weight: var(--fw-regular); }

.gks-fbl__tags { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: var(--sp-2); }
.gks-fbl__tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-soft);
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
}
.gks-fbl__tag--alert { background: var(--red-050); border-color: var(--red-100); color: var(--red-800); font-weight: var(--fw-semibold); }
.gks-fbl__tag--success { background: var(--success-bg); border-color: var(--success-line); color: var(--success-fg); }
.gks-fbl__tag--warning { background: var(--warning-bg); border-color: var(--warning-line); color: var(--warning-fg); }
.gks-fbl__tag--danger { background: var(--danger-bg); border-color: var(--danger-line); color: var(--danger-fg); }
.gks-fbl__tag--muted { border-style: dashed; }

.gks-fbl__badge {
  flex: none;
  align-self: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: 11px;
  font-weight: var(--fw-bold);
}

.gks-fbl__loading { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); }
.gks-fbl__skeleton {
  height: 58px;
  border-radius: var(--radius-2);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-fbl-shimmer 1.4s ease-in-out infinite;
}
@keyframes gks-fbl-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .gks-fbl__skeleton { animation: none; } }
</style>
