<script setup lang="ts">
import type { ConversationTopic, PortalCase } from '@gks/shared';

/**
 * Opening a thread (1K).
 *
 * Deliberately close to a single box. The brief was "нэвтэрч ороод шууд
 * асуултаа асуугаад" — log in and just ask — so the only thing above the
 * message is a row of topic chips, which costs one tap and saves the office
 * from guessing what the question is about. Everything else is optional and
 * folded away: a title we can derive from the first sentence, and a service to
 * attach that only matters when somebody has more than one.
 */
const props = defineProps<{
  cases?: PortalCase[];
  sending?: boolean;
}>();

const emit = defineEmits<{
  submit: [payload: { topic: ConversationTopic; subject?: string; caseId?: string; body: string }];
  cancel: [];
}>();

const topic = ref<ConversationTopic>('GENERAL');
const subject = ref('');
const caseId = ref<string>('');
const body = ref('');
const showDetails = ref(false);

const canSend = computed(() => body.value.trim().length > 0 && !props.sending);
const caseOptions = computed(() =>
  (props.cases ?? []).map((row) => ({ value: row.id, label: `${row.code} · ${SERVICE_LABELS[row.serviceType]}` })),
);

function submit(): void {
  if (!canSend.value) return;
  emit('submit', {
    topic: topic.value,
    subject: subject.value.trim() || undefined,
    caseId: caseId.value || undefined,
    body: body.value.trim(),
  });
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
  event.preventDefault();
  submit();
}
</script>

<template>
  <form class="gks-start" @submit.prevent="submit">
    <header class="gks-start__head">
      <h2 class="gks-start__title">Юуны талаар асуух вэ?</h2>
      <p class="gks-start__lede">
        Сэдвээ сонгоод асуултаа бичээрэй. Ажлын өдрүүдэд ихэвчлэн нэг цагийн дотор зөвлөх хариу өгдөг.
      </p>
    </header>

    <fieldset class="gks-start__topics">
      <legend class="gks-start__legend">Сэдэв</legend>
      <label
        v-for="option in CONVERSATION_TOPIC_ORDER"
        :key="option"
        class="gks-start__chip"
        :class="{ 'gks-start__chip--on': topic === option }"
      >
        <input v-model="topic" type="radio" name="messenger-topic" :value="option" class="gks-start__radio">
        <DsIcon :name="CONVERSATION_TOPIC_ICONS[option]" :size="15" />
        <span>{{ CONVERSATION_TOPIC_LABELS[option] }}</span>
      </label>
    </fieldset>

    <DsTextarea
      v-model="body"
      label="Асуулт"
      :rows="6"
      placeholder="Жишээ нь: Бакалаврын хөтөлбөрт бүртгүүлэхэд TOPIK хэддүгээр түвшин хэрэгтэй вэ?"
      :disabled="sending"
      @keydown="onKeydown"
    />

    <button type="button" class="gks-start__toggle" @click="showDetails = !showDetails">
      <DsIcon :name="showDetails ? 'chevron-down' : 'chevron-right'" :size="14" />
      Нэмэлт мэдээлэл {{ showDetails ? 'хаах' : 'нэмэх' }}
    </button>

    <div v-if="showDetails" class="gks-start__details">
      <DsInput
        v-model="subject"
        label="Гарчиг"
        hint="Хоосон орхивол асуултын эхний өгүүлбэрээр нэрлэгдэнэ"
        maxlength="160"
        :disabled="sending"
      />
      <DsSelect
        v-if="caseOptions.length"
        v-model="caseId"
        label="Аль үйлчилгээний тухай вэ?"
        hint="Тодорхой үйлчилгээтэй холбоотой бол сонгоно уу"
        :options="[{ value: '', label: 'Тодорхой үйлчилгээтэй холбоогүй' }, ...caseOptions]"
        :disabled="sending"
      />
    </div>

    <footer class="gks-start__foot">
      <DsButton variant="accent" type="submit" icon-right="send-horizontal" :loading="sending" :disabled="!canSend">
        Асуултаа илгээх
      </DsButton>
      <DsButton variant="ghost" type="button" :disabled="sending" @click="emit('cancel')">Болих</DsButton>
    </footer>
  </form>
</template>

<style scoped>
.gks-start {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  max-width: 640px;
  margin: 0 auto;
  padding: var(--sp-6);
}

.gks-start__head { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-start__title { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); }
.gks-start__lede { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-start__topics { display: flex; flex-wrap: wrap; gap: var(--sp-2); border: 0; padding: 0; margin: 0; }
.gks-start__legend {
  width: 100%;
  margin-bottom: var(--sp-2);
  padding: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
}

.gks-start__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--control-sm);
  padding: 0 var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  font-size: var(--fs-caption);
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-start__chip:hover { border-color: var(--line-strong); color: var(--text-strong); }
.gks-start__chip--on {
  background: var(--brand-600);
  border-color: var(--brand-600);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}
/* The radio still takes focus and still answers to the arrow keys; only the
   dot is gone, replaced by the chip's own filled state. */
.gks-start__radio { position: absolute; opacity: 0; width: 0; height: 0; }
.gks-start__chip:has(.gks-start__radio:focus-visible) { box-shadow: var(--shadow-focus); }

.gks-start__toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  border: 0;
  background: none;
  padding: 0;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  cursor: pointer;
}
.gks-start__toggle:hover { color: var(--brand-600); }

.gks-start__details { display: flex; flex-direction: column; gap: var(--sp-4); }

.gks-start__foot { display: flex; align-items: center; gap: var(--sp-3); }

@media (max-width: 640px) {
  .gks-start { padding: var(--sp-5) var(--gutter-mobile); gap: var(--sp-4); }
}
</style>
