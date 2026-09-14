<script setup lang="ts">
import type { AiFeedbackReason, AiFeedbackValue } from '@gks/shared';
import { AI_FEEDBACK_REASON_LABELS } from '~/utils/labels';

/**
 * 👍/👎 on one answer (2C-11).
 *
 * A 👍 is one click and asks nothing more. A 👎 opens for a reason, because the
 * four reasons go to different places: "буруу" is a document somebody has to
 * correct, "дутуу" is usually a gap in the knowledge base (§10.3), "хамаагүй"
 * is a retrieval problem, and "бусад" is the one that needs a human to read the
 * comment. A thumb with no reason is a number nobody can act on.
 *
 * Nothing here blocks: the form can be skipped and the 👎 still counts.
 */
const props = defineProps<{
  feedback: { value: AiFeedbackValue; reason: AiFeedbackReason | null } | null;
}>();

const emit = defineEmits<{
  rate: [payload: { value: AiFeedbackValue; reason?: AiFeedbackReason; comment?: string }];
}>();

const asking = ref(false);
const reason = ref<AiFeedbackReason | null>(null);
const comment = ref('');

const REASONS = Object.keys(AI_FEEDBACK_REASON_LABELS) as AiFeedbackReason[];

const given = computed(() => props.feedback?.value ?? null);

function up(): void {
  asking.value = false;
  emit('rate', { value: 'UP' });
}

function down(): void {
  // The 👎 is recorded immediately; the reason refines it afterwards. A visitor
  // who clicks and walks away has still told us something.
  emit('rate', { value: 'DOWN' });
  asking.value = true;
}

function submit(): void {
  emit('rate', {
    value: 'DOWN',
    ...(reason.value ? { reason: reason.value } : {}),
    ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
  });
  asking.value = false;
}
</script>

<template>
  <div class="gks-chat-rate">
    <div class="gks-chat-rate__thumbs">
      <button
        type="button"
        class="gks-chat-rate__thumb"
        :class="{ 'gks-chat-rate__thumb--on': given === 'UP' }"
        :aria-pressed="given === 'UP'"
        aria-label="Хэрэгтэй хариулт"
        @click="up"
      >
        <DsIcon name="thumbs-up" :size="14" />
      </button>
      <button
        type="button"
        class="gks-chat-rate__thumb"
        :class="{ 'gks-chat-rate__thumb--on': given === 'DOWN' }"
        :aria-pressed="given === 'DOWN'"
        aria-label="Хэрэггүй хариулт"
        @click="down"
      >
        <DsIcon name="thumbs-down" :size="14" />
      </button>
      <span v-if="given && !asking" class="gks-chat-rate__thanks">Баярлалаа</span>
    </div>

    <div v-if="asking" class="gks-chat-rate__form">
      <p class="gks-chat-rate__prompt">Юу нь болоогүй вэ?</p>
      <div class="gks-chat-rate__reasons">
        <button
          v-for="key in REASONS"
          :key="key"
          type="button"
          class="gks-chat-rate__reason"
          :class="{ 'gks-chat-rate__reason--on': reason === key }"
          @click="reason = reason === key ? null : key"
        >
          {{ AI_FEEDBACK_REASON_LABELS[key] }}
        </button>
      </div>
      <DsTextarea v-model="comment" :rows="2" placeholder="Нэмж хэлэх зүйл (заавал биш)" />
      <div class="gks-chat-rate__actions">
        <DsButton variant="secondary" size="sm" @click="asking = false">Болих</DsButton>
        <DsButton size="sm" @click="submit">Илгээх</DsButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-chat-rate { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-chat-rate__thumbs { display: flex; align-items: center; gap: var(--sp-1); }
.gks-chat-rate__thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-1);
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.gks-chat-rate__thumb:hover { background: var(--surface-wash); color: var(--brand-600); }
.gks-chat-rate__thumb--on { background: var(--brand-100); color: var(--brand-700); }
.gks-chat-rate__thanks { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-chat-rate__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
}
.gks-chat-rate__prompt { font-size: var(--fs-caption); color: var(--text-strong); font-weight: var(--fw-semibold); }
.gks-chat-rate__reasons { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-chat-rate__reason {
  padding: 4px var(--sp-3);
  border-radius: var(--radius-pill);
  border: var(--border-hair) solid var(--line-soft);
  background: var(--surface-wash);
  font-size: var(--fs-caption);
  color: var(--text-strong);
  cursor: pointer;
}
.gks-chat-rate__reason--on { background: var(--brand-600); border-color: var(--brand-600); color: var(--text-inverse); }
.gks-chat-rate__actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }
</style>
