<script setup lang="ts">
import type { FacebookMessageItem } from '@gks/shared';

/**
 * One line of a Messenger thread (2F).
 *
 * Unlike the portal chat there are three voices on "our" side, and staff have
 * to tell them apart at a glance: the assistant (what it said is ours to stand
 * behind or correct), a colleague on this screen, and somebody answering from
 * Meta Business Suite — who never saw this inbox and may not know what the
 * assistant already promised. Each gets its own colour and its own label.
 *
 * A staff reply can become a draft answer card for the assistant (2F): the
 * office answering a question well once is how the assistant learns to answer
 * it next time.
 */
const props = defineProps<{
  message: FacebookMessageItem;
  /** First of a run from this sender — the one that carries the label. */
  leading?: boolean;
  /** Last of a run — it carries the clock. */
  trailing?: boolean;
  /** Whether "Мэдлэгийн санд нэмэх" is offered at all (the knowledge base is staff-only). */
  canTeach?: boolean;
  teaching?: boolean;
}>();

defineEmits<{ teach: [message: FacebookMessageItem] }>();

const own = computed(() => props.message.sender !== 'CONTACT');

const label = computed(() => {
  const { sender, staffName } = props.message;
  if (sender === 'STAFF') return staffName ?? FACEBOOK_SENDER_LABELS.STAFF;
  return sender === 'CONTACT' ? null : FACEBOOK_SENDER_LABELS[sender];
});

/** Only a reply a person wrote is worth teaching; the assistant's own words would just echo. */
const teachable = computed(
  () => (props.message.sender === 'STAFF' || props.message.sender === 'PAGE') && Boolean(props.message.text?.trim()),
);

const LABEL_ICON = { AI: 'bot', STAFF: 'user-round', PAGE: 'facebook' } as const;

/** Stickers are pictures too; anything else becomes a plain link. */
const isPicture = (type: string): boolean => type === 'image' || type === 'sticker';
</script>

<template>
  <div
    class="gks-fbm"
    :class="[
      own ? 'gks-fbm--own' : 'gks-fbm--other',
      `gks-fbm--${message.sender.toLowerCase()}`,
      { 'gks-fbm--leading': leading },
    ]"
  >
    <div class="gks-fbm__col">
      <p v-if="leading && label" class="gks-fbm__sender">
        <DsIcon v-if="message.sender !== 'CONTACT'" :name="LABEL_ICON[message.sender]" :size="12" />
        {{ label }}
      </p>

      <div class="gks-fbm__bubble" :class="{ 'gks-fbm__bubble--failed': message.status === 'FAILED' }">
        <p v-if="message.text" class="gks-fbm__body">{{ message.text }}</p>

        <div v-if="message.attachments.length" class="gks-fbm__files">
          <template v-for="(file, index) in message.attachments" :key="index">
            <a
              v-if="file.url && isPicture(file.type)"
              :href="file.url"
              target="_blank"
              rel="noopener noreferrer"
              class="gks-fbm__photo"
              :class="{ 'gks-fbm__photo--sticker': file.type === 'sticker' }"
            >
              <img :src="file.url" alt="Хавсаргасан зураг" loading="lazy" decoding="async" referrerpolicy="no-referrer">
            </a>
            <a v-else-if="file.url" :href="file.url" target="_blank" rel="noopener noreferrer" class="gks-fbm__file">
              <DsIcon name="paperclip" :size="14" /> Хавсралт ({{ file.type }})
            </a>
            <!-- Meta's CDN links expire; saying so beats a broken image. -->
            <span v-else class="gks-fbm__file gks-fbm__file--gone">
              <DsIcon name="paperclip" :size="14" /> Хавсралт — холбоос хүчингүй болсон
            </span>
          </template>
        </div>
      </div>

      <p v-if="message.status === 'FAILED'" class="gks-fbm__error">
        <DsIcon name="triangle-alert" :size="13" />
        Facebook руу илгээгдсэнгүй{{ message.error ? `: ${message.error}` : '' }}
      </p>

      <div v-if="trailing || (canTeach && teachable)" class="gks-fbm__meta">
        <span v-if="message.commentId" class="gks-fbm__tagline">Сэтгэгдлийн хувийн хариу</span>
        <span v-if="trailing" class="gks-tnum">{{ messageTime(message.createdAt) }}</span>
        <template v-if="canTeach && teachable">
          <NuxtLink
            v-if="message.knowledgeDocumentId"
            :to="`/admin/ai/knowledge/${message.knowledgeDocumentId}`"
            class="gks-fbm__teach gks-fbm__teach--done"
          >
            <DsIcon name="book-check" :size="13" /> Мэдлэгийн санд
          </NuxtLink>
          <button
            v-else
            type="button"
            class="gks-fbm__teach"
            :disabled="teaching"
            @click="$emit('teach', message)"
          >
            <DsIcon :name="teaching ? 'loader-circle' : 'book-plus'" :size="13" /> Мэдлэгийн санд нэмэх
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gks-fbm { display: flex; }
.gks-fbm--own { justify-content: flex-end; }
.gks-fbm + .gks-fbm { margin-top: 2px; }
.gks-fbm--leading { margin-top: var(--sp-4); }

.gks-fbm__col { display: flex; flex-direction: column; min-width: 0; max-width: min(560px, 78%); }
.gks-fbm--own .gks-fbm__col { align-items: flex-end; }

.gks-fbm__sender {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0 var(--sp-2) var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
}

.gks-fbm__bubble {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-3);
  border: var(--border-hair) solid transparent;
}
.gks-fbm--contact .gks-fbm__bubble {
  background: var(--surface-card);
  border-color: var(--line-hairline);
  color: var(--text-body);
}
/* A person on this screen: the brand blue, as in the portal chat. */
.gks-fbm--staff .gks-fbm__bubble { background: var(--brand-600); color: var(--text-inverse); box-shadow: var(--shadow-brand); }
/* The assistant: ours, but pale — a voice somebody may need to correct. */
.gks-fbm--ai .gks-fbm__bubble { background: var(--brand-050); border-color: var(--brand-200); color: var(--brand-900); }
/* Meta Business Suite: ours, from outside this screen. */
.gks-fbm--page .gks-fbm__bubble { background: var(--ink-800); color: var(--text-inverse); }

/* Doubled class so a failed send out-ranks every sender colour above. */
.gks-fbm__bubble.gks-fbm__bubble--failed {
  background: var(--danger-bg);
  border-color: var(--danger-line);
  color: var(--danger-fg);
  box-shadow: none;
}

.gks-fbm__body {
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.gks-fbm__files { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-fbm__body + .gks-fbm__files { margin-top: var(--sp-2); }
.gks-fbm__photo {
  display: block;
  width: min(260px, 60vw);
  max-height: 340px;
  overflow: hidden;
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
}
.gks-fbm__photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
.gks-fbm__photo--sticker { width: 120px; background: transparent; }
.gks-fbm__photo--sticker img { object-fit: contain; }
.gks-fbm__file {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.gks-fbm__file--gone { text-decoration: none; opacity: .75; }

.gks-fbm__error {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: var(--sp-1) var(--sp-2) 0;
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--danger-fg);
}

.gks-fbm__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2) 0;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-fbm__tagline { font-style: italic; }
.gks-fbm__teach {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--brand-600);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  text-decoration: none;
  cursor: pointer;
}
.gks-fbm__teach:hover:not(:disabled) { text-decoration: underline; text-underline-offset: 2px; }
.gks-fbm__teach:disabled { cursor: progress; opacity: .6; }
.gks-fbm__teach--done { color: var(--success-fg); }

@media (max-width: 640px) {
  .gks-fbm__col { max-width: 86%; }
}
</style>
