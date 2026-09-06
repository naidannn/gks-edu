<script setup lang="ts">
import type { ConversationDetail, ConversationListItem } from '@gks/shared';

/**
 * The list of threads (1K) — the client's own on the left of `/messages`, the
 * shared queue on the left of `/admin/messages`.
 *
 * One component for both because a row is the same object either way: who it
 * is with, what it is about, the last line, and how long it has been waiting.
 * The staff variant adds the two things only they act on — whose thread it is,
 * and whether anybody has claimed it.
 */
const props = defineProps<{
  items: (ConversationListItem | ConversationDetail)[];
  activeId?: string | null;
  /** Staff rows lead with the person, client rows lead with the subject. */
  staff?: boolean;
  pending?: boolean;
}>();

defineEmits<{ select: [id: string] }>();

/** `ConversationDetail` only on the staff side; narrowing keeps the template honest. */
function clientOf(item: ConversationListItem | ConversationDetail) {
  return 'client' in item ? item.client : null;
}

const rows = computed(() =>
  props.items.map((item) => ({
    item,
    client: clientOf(item),
    unclaimed: props.staff === true && !item.assignee && item.status === 'OPEN',
  })),
);
</script>

<template>
  <ul v-if="rows.length" class="gks-threads" role="list">
    <li v-for="row in rows" :key="row.item.id">
      <button
        type="button"
        class="gks-threads__row"
        :class="{
          'gks-threads__row--active': row.item.id === activeId,
          'gks-threads__row--unread': row.item.unread > 0,
        }"
        :aria-current="row.item.id === activeId ? 'true' : undefined"
        @click="$emit('select', row.item.id)"
      >
        <span
          class="gks-threads__avatar"
          :class="{ 'gks-threads__avatar--unclaimed': row.unclaimed }"
          aria-hidden="true"
        >
          <DsIcon v-if="!staff" :name="CONVERSATION_TOPIC_ICONS[row.item.topic]" :size="17" />
          <template v-else>{{ initials(row.client?.name ?? row.item.subject) }}</template>
        </span>

        <span class="gks-threads__body">
          <span class="gks-threads__top">
            <span class="gks-threads__title">
              {{ staff ? (row.client?.name ?? 'Нэргүй хэрэглэгч') : row.item.subject }}
            </span>
            <span class="gks-threads__time gks-tnum">{{ threadTime(row.item.lastMessageAt) }}</span>
          </span>

          <span class="gks-threads__sub">
            {{ staff ? row.item.subject : CONVERSATION_TOPIC_SHORT[row.item.topic] }}
          </span>

          <span class="gks-threads__preview">
            <!-- "Та:" marks the rows where the last word was the reader's own,
                 which is what separates "waiting on them" from "owed a reply"
                 at a glance. Staff and client each see it on their own lines. -->
            <span v-if="row.item.lastMessageFromStaff === Boolean(staff)" class="gks-threads__you">Та:</span>
            {{ row.item.lastMessagePreview ?? '—' }}
          </span>

          <span class="gks-threads__tags">
            <span v-if="row.unclaimed" class="gks-threads__tag gks-threads__tag--new">Хариуцаагүй</span>
            <span v-else-if="staff && row.item.assignee" class="gks-threads__tag">
              {{ row.item.assignee.name ?? 'Ажилтан' }}
            </span>
            <span v-if="staff" class="gks-threads__tag">{{ CONVERSATION_TOPIC_SHORT[row.item.topic] }}</span>
            <span v-if="row.item.status === 'RESOLVED'" class="gks-threads__tag gks-threads__tag--done">
              Шийдвэрлэсэн
            </span>
            <span v-if="row.client?.clientCode" class="gks-threads__tag gks-tnum">{{ row.client.clientCode }}</span>
          </span>
        </span>

        <span v-if="row.item.unread" class="gks-threads__badge gks-tnum">{{ row.item.unread }}</span>
      </button>
    </li>
  </ul>

  <div v-else-if="pending" class="gks-threads__loading">
    <span v-for="n in 4" :key="n" class="gks-threads__skeleton" />
  </div>

  <slot v-else name="empty" />
</template>

<style scoped>
.gks-threads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }

.gks-threads__row {
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
.gks-threads__row:hover { background: var(--surface-hover); }
.gks-threads__row--active {
  background: var(--surface-selected);
  border-left-color: var(--brand-600);
}
.gks-threads__row--active:hover { background: var(--surface-selected); }

.gks-threads__avatar {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--n-100);
  color: var(--n-600);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
}
.gks-threads__row--unread .gks-threads__avatar { background: var(--brand-100); color: var(--brand-800); }
/* Unclaimed is the one state the office must not scroll past. */
.gks-threads__avatar--unclaimed { background: var(--red-100); color: var(--red-800); }

.gks-threads__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }

.gks-threads__top { display: flex; align-items: baseline; gap: var(--sp-2); }
.gks-threads__title {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-threads__time { flex: none; font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-threads__sub,
.gks-threads__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-micro);
}
.gks-threads__sub { color: var(--text-muted); font-weight: var(--fw-medium); }
.gks-threads__preview { color: var(--text-subtle); }
.gks-threads__row--unread .gks-threads__preview { color: var(--text-body); font-weight: var(--fw-medium); }
.gks-threads__you { color: var(--text-subtle); font-weight: var(--fw-regular); }

.gks-threads__tags { display: flex; flex-wrap: wrap; gap: var(--sp-1); margin-top: var(--sp-2); }
.gks-threads__tag {
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-soft);
  font-size: 11px;
  color: var(--text-subtle);
  white-space: nowrap;
}
.gks-threads__tag--new {
  background: var(--red-050);
  border-color: var(--red-100);
  color: var(--red-800);
  font-weight: var(--fw-semibold);
}
.gks-threads__tag--done { background: var(--success-bg); border-color: var(--success-line); color: var(--success-fg); }

.gks-threads__badge {
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

.gks-threads__loading { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); }
.gks-threads__skeleton {
  height: 58px;
  border-radius: var(--radius-2);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-threads-shimmer 1.4s ease-in-out infinite;
}
@keyframes gks-threads-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .gks-threads__skeleton { animation: none; } }
</style>
