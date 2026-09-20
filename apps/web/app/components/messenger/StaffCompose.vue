<script setup lang="ts">
import type { ConversationRecipient, ConversationTopic } from '@gks/shared';

/**
 * The office writing first (1K-13).
 *
 * The mirror image of `StartForm`: there the client picks a topic and types,
 * here a consultant picks a person and types. Everything above the message box
 * is about *who*, because that is the only thing the staff side has to decide
 * and the client side never does.
 *
 * The recipient list is limited to clients who signed a contract, and the one
 * warning this form carries is the duplicate: if the person already has an
 * open thread, answering there keeps the shared inbox one queue instead of
 * two, so the form offers that instead of quietly creating a second.
 */
const props = defineProps<{
  recipients: ConversationRecipient[];
  /** The recipient list is still being fetched. */
  loading?: boolean;
  sending?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  submit: [payload: { clientUserId: string; topic: ConversationTopic; subject?: string; caseId?: string; body: string }];
  openExisting: [conversationId: string];
  cancel: [];
}>();

const clientUserId = ref('');
const topic = ref<ConversationTopic>('GENERAL');
const subject = ref('');
const caseId = ref('');
const body = ref('');

const recipient = computed(() => props.recipients.find((row) => row.id === clientUserId.value) ?? null);

const recipientOptions = computed(() =>
  props.recipients.map((row) => ({
    value: row.id,
    label: row.name,
    // The office identifies people by client code and phone far more reliably
    // than by name — two Батболд-s is the normal case, not the edge one.
    sub: [row.clientCode, row.phone, CHAT_STANDING_LABELS[row.phase]].filter(Boolean).join(' · '),
    keywords: [row.email, row.openConversationCode].filter(Boolean).join(' '),
  })),
);

const caseOptions = computed(() => [
  { value: '', label: 'Тодорхой үйлчилгээтэй холбоогүй' },
  ...(recipient.value?.cases ?? []).map((row) => ({
    value: row.id,
    label: `${row.code} · ${SERVICE_LABELS[row.serviceType]}`,
  })),
]);

const canSend = computed(() => Boolean(clientUserId.value) && body.value.trim().length > 0 && !props.sending);

// A recipient's services belong to that recipient; keep a stale pick from
// travelling to the next person chosen.
watch(clientUserId, () => (caseId.value = ''));

function submit(): void {
  if (!canSend.value) return;
  emit('submit', {
    clientUserId: clientUserId.value,
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
  <form class="gks-compose" @submit.prevent="submit">
    <header class="gks-compose__head">
      <h2 class="gks-compose__title">Шинэ чат эхлүүлэх</h2>
      <p class="gks-compose__lede">
        Гэрээтэй хэрэглэгч рүү шууд бичнэ. Хэрэглэгч нь кабинетынхаа «Чат» хэсгээс харж, мэдэгдэл хүлээн авна.
      </p>
    </header>

    <DsCombobox
      v-model="clientUserId"
      label="Хэнд бичих вэ?"
      :options="recipientOptions"
      :loading="loading"
      :disabled="sending"
      placeholder="Нэр, утас, харилцагчийн кодоор хайх"
      hint="Зөвхөн гэрээ байгуулсан хэрэглэгчид жагсана"
    />

    <!-- The duplicate guard. Loud enough to read, but it never blocks: there
         are real reasons to open a second thread on a different subject. -->
    <div v-if="recipient?.openConversationId" class="gks-compose__existing">
      <DsIcon name="message-circle" :size="16" />
      <p>
        Энэ хэрэглэгчтэй <span class="gks-tnum">{{ recipient.openConversationCode }}</span> нээлттэй чат байна.
        Шинээр эхлүүлэхийн оронд тэндээ үргэлжлүүлбэл inbox хоёр тасалгаа болохгүй.
      </p>
      <DsButton
        size="sm"
        variant="secondary"
        icon-left="arrow-right"
        :disabled="sending"
        @click="emit('openExisting', recipient.openConversationId)"
      >
        Нээх
      </DsButton>
    </div>

    <fieldset class="gks-compose__topics">
      <legend class="gks-compose__legend">Сэдэв</legend>
      <label
        v-for="option in CONVERSATION_TOPIC_ORDER"
        :key="option"
        class="gks-compose__chip"
        :class="{ 'gks-compose__chip--on': topic === option }"
      >
        <input v-model="topic" type="radio" name="staff-compose-topic" :value="option" class="gks-compose__radio">
        <DsIcon :name="CONVERSATION_TOPIC_ICONS[option]" :size="15" />
        <span>{{ CONVERSATION_TOPIC_LABELS[option] }}</span>
      </label>
    </fieldset>

    <DsInput
      v-model="subject"
      label="Гарчиг"
      hint="Хоосон орхивол мессежийн эхний өгүүлбэрээр нэрлэгдэнэ"
      maxlength="160"
      :disabled="sending"
    />

    <DsSelect
      v-if="recipient?.cases.length"
      v-model="caseId"
      label="Аль үйлчилгээний тухай вэ?"
      :options="caseOptions"
      :disabled="sending"
    />

    <DsTextarea
      v-model="body"
      label="Мессеж"
      :rows="6"
      placeholder="Жишээ нь: Сайн байна уу. Паспортын хуулбар дутуу байгаа тул 9 сарын 25-ны дотор илгээнэ үү."
      :disabled="sending"
      @keydown="onKeydown"
    />

    <p v-if="error" class="gks-compose__error">
      <DsIcon name="triangle-alert" :size="14" /> {{ error }}
    </p>

    <footer class="gks-compose__foot">
      <DsButton variant="accent" type="submit" icon-right="send-horizontal" :loading="sending" :disabled="!canSend">
        Илгээх
      </DsButton>
      <DsButton variant="ghost" type="button" :disabled="sending" @click="emit('cancel')">Болих</DsButton>
    </footer>
  </form>
</template>

<style scoped>
.gks-compose {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: var(--sp-6);
  overflow-y: auto;
}

.gks-compose__head { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-compose__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-compose__lede { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-compose__existing {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: var(--fs-caption);
}
.gks-compose__existing p { flex: 1; min-width: 0; }

.gks-compose__topics { display: flex; flex-wrap: wrap; gap: var(--sp-2); border: 0; padding: 0; margin: 0; }
.gks-compose__legend {
  width: 100%;
  margin-bottom: var(--sp-2);
  padding: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
}

.gks-compose__chip {
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
.gks-compose__chip:hover { border-color: var(--line-strong); color: var(--text-strong); }
.gks-compose__chip--on {
  background: var(--brand-600);
  border-color: var(--brand-600);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}
/* The radio keeps focus and the arrow keys; only its dot is gone. */
.gks-compose__radio { position: absolute; opacity: 0; width: 0; height: 0; }
.gks-compose__chip:has(.gks-compose__radio:focus-visible) { box-shadow: var(--shadow-focus); }

.gks-compose__error {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--danger-fg);
}

.gks-compose__foot { display: flex; align-items: center; gap: var(--sp-3); }

@media (max-width: 640px) {
  .gks-compose { padding: var(--sp-5) var(--gutter-mobile); gap: var(--sp-4); }
  .gks-compose__existing { flex-wrap: wrap; }
}
</style>
