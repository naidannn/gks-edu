<script setup lang="ts">
import type { PendingMessage } from '~/composables/useMessengerThread';

/**
 * One message (1K).
 *
 * Three states share this component: a stored message, one still in flight
 * (dimmed, no clock yet), and one whose send failed (bordered red, offering a
 * retry rather than disappearing and losing what somebody typed).
 *
 * A SYSTEM line — claimed, resolved, reopened — is not anybody's bubble and
 * renders centred and quiet instead.
 */
const props = defineProps<{
  message: PendingMessage;
  /** True when this is the reader's own side of the thread. */
  own: boolean;
  /** First message of a run from this sender — the one that carries the name. */
  leading?: boolean;
  /** Last of a run: it gets the clock and the pointed corner. */
  trailing?: boolean;
  /** Shown under the last own message the other side has read. */
  readMark?: boolean;
}>();

defineEmits<{ retry: [message: PendingMessage] }>();

const senderName = computed(() => props.message.sender?.name ?? (props.message.fromStaff ? 'GKS зөвлөх' : ''));
</script>

<template>
  <div v-if="message.kind === 'SYSTEM'" class="gks-msg-system">
    <span>{{ message.body }}</span>
  </div>

  <div
    v-else
    class="gks-msg"
    :class="[
      own ? 'gks-msg--own' : 'gks-msg--other',
      { 'gks-msg--leading': leading, 'gks-msg--trailing': trailing },
    ]"
  >
    <!-- The avatar column is always reserved, so a run of bubbles keeps one
         edge even though only its first message shows a face. -->
    <div v-if="!own" class="gks-msg__avatar" :class="{ 'gks-msg__avatar--hidden': !leading }" aria-hidden="true">
      {{ initials(senderName, 'G') }}
    </div>

    <div class="gks-msg__col">
      <p v-if="!own && leading && senderName" class="gks-msg__sender">{{ senderName }}</p>

      <div
        class="gks-msg__bubble"
        :class="{ 'gks-msg__bubble--pending': message.pending, 'gks-msg__bubble--failed': message.failed }"
      >
        <p class="gks-msg__body">{{ message.body }}</p>
      </div>

      <div v-if="trailing || message.failed" class="gks-msg__meta">
        <template v-if="message.failed">
          <span class="gks-msg__failed">Илгээгдсэнгүй</span>
          <button type="button" class="gks-msg__retry" @click="$emit('retry', message)">Дахин илгээх</button>
        </template>
        <template v-else-if="message.pending">
          <span class="gks-msg__time">Илгээж байна…</span>
        </template>
        <template v-else>
          <span class="gks-msg__time gks-tnum">{{ messageTime(message.createdAt) }}</span>
          <span v-if="readMark" class="gks-msg__read">
            <DsIcon name="check-check" :size="13" /> Уншсан
          </span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ---- System line ---- */
.gks-msg-system {
  display: flex;
  justify-content: center;
  padding: var(--sp-2) 0;
}
.gks-msg-system span {
  max-width: 80%;
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
  text-align: center;
}

/* ---- Bubble ---- */
.gks-msg { display: flex; gap: var(--sp-3); align-items: flex-end; }
.gks-msg--own { justify-content: flex-end; }
.gks-msg + .gks-msg { margin-top: 2px; }
.gks-msg--leading { margin-top: var(--sp-4); }

.gks-msg__avatar {
  flex: none;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--brand-100);
  color: var(--brand-800);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: 0;
}
.gks-msg__avatar--hidden { visibility: hidden; }

.gks-msg__col { display: flex; flex-direction: column; min-width: 0; max-width: min(560px, 78%); }
.gks-msg--own .gks-msg__col { align-items: flex-end; }

.gks-msg__sender {
  padding: 0 var(--sp-2) var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
}

.gks-msg__bubble {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-3);
  transition: opacity var(--dur-base) var(--ease-standard);
}
.gks-msg--other .gks-msg__bubble {
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  color: var(--text-body);
  border-bottom-left-radius: var(--sp-1);
}
.gks-msg--other.gks-msg--trailing .gks-msg__bubble { border-bottom-left-radius: var(--radius-3); }
.gks-msg--other.gks-msg--leading .gks-msg__bubble { border-top-left-radius: var(--sp-1); }

.gks-msg--own .gks-msg__bubble {
  background: var(--brand-600);
  color: var(--text-inverse);
  box-shadow: var(--shadow-brand);
  border-bottom-right-radius: var(--sp-1);
}
.gks-msg--own.gks-msg--trailing .gks-msg__bubble { border-bottom-right-radius: var(--radius-3); }
.gks-msg--own.gks-msg--leading .gks-msg__bubble { border-top-right-radius: var(--sp-1); }

.gks-msg__bubble--pending { opacity: .62; }
/* Doubled class on purpose: `.gks-msg--own .gks-msg__bubble` above is a
   two-class selector, and a failed bubble has to out-rank the blue on both
   sides of the thread. */
.gks-msg__bubble.gks-msg__bubble--failed {
  background: var(--danger-bg);
  border: var(--border-hair) solid var(--danger-line);
  color: var(--danger-fg);
  box-shadow: none;
}

/* `pre-wrap` keeps the paragraph breaks somebody typed; `anywhere` stops a
   pasted URL from pushing the bubble past the pane. */
.gks-msg__body {
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.gks-msg__meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2) 0;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-msg__read { display: inline-flex; align-items: center; gap: 2px; color: var(--brand-600); }
.gks-msg__failed { color: var(--danger-fg); font-weight: var(--fw-semibold); }
.gks-msg__retry {
  border: 0;
  background: none;
  padding: 0;
  color: var(--brand-600);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

@media (max-width: 640px) {
  .gks-msg__col { max-width: 84%; }
}
</style>
