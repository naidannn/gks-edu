<script setup lang="ts">
import type { FacebookStatus } from '@gks/shared';

/**
 * The Page's switches (2F), admins only.
 *
 * They live on the assistant's own configuration (`/admin/ai/config`) — there
 * is one assistant, and the Page is one more place it answers — but they are
 * set from here, beside the inbox they change, because this is where someone
 * notices the assistant answering comments it should not.
 */
const props = defineProps<{ status: FacebookStatus }>();

const emit = defineEmits<{ saved: []; close: [] }>();

const api = useApi();

const form = reactive({
  facebookEnabled: props.status.facebookEnabled,
  facebookCommentsEnabled: props.status.facebookCommentsEnabled,
  facebookCommentReply: props.status.facebookCommentReply,
  facebookStaffPauseHours: String(props.status.facebookStaffPauseHours),
});

const saving = ref(false);
const error = ref<string | null>(null);
const pauseError = ref<string | undefined>(undefined);

async function save(): Promise<void> {
  const hours = Number(form.facebookStaffPauseHours);
  pauseError.value = Number.isInteger(hours) && hours >= 1 && hours <= 168 ? undefined : '1–168 цагийн хооронд бүхэл тоо';
  if (pauseError.value) return;

  saving.value = true;
  error.value = null;
  try {
    await api.patch('/admin/ai/config', {
      facebookEnabled: form.facebookEnabled,
      facebookCommentsEnabled: form.facebookCommentsEnabled,
      facebookCommentReply: form.facebookCommentReply.trim(),
      facebookStaffPauseHours: hours,
    });
    emit('saved');
  } catch (e) {
    error.value = apiErrorMessage(e, 'Тохиргоог хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="gks-fbs" @submit.prevent="save">
    <div class="gks-fbs__head">
      <h2 class="gks-fbs__title">Facebook тохиргоо</h2>
      <button type="button" class="gks-fbs__close" aria-label="Хаах" @click="emit('close')">
        <DsIcon name="x" :size="16" />
      </button>
    </div>

    <div class="gks-fbs__grid">
      <div class="gks-fbs__switches">
        <DsSwitch v-model="form.facebookEnabled" label="Messenger-т AI автоматаар хариулна" />
        <DsSwitch v-model="form.facebookCommentsEnabled" label="Постын сэтгэгдэлд AI хариулна" />
        <p class="gks-fbs__hint">
          Сэтгэгдэлд AI Messenger-ээр хувиар хариулж, сэтгэгдлийн доор доорх мөрийг нийтэд үлдээнэ.
        </p>
      </div>

      <DsTextarea
        v-model="form.facebookCommentReply"
        label="Сэтгэгдлийн доор үлдээх мөр"
        :rows="2"
        maxlength="500"
        hint="Жишээ нь: «Танд Messenger-ээр дэлгэрэнгүй хариу илгээлээ.»"
      />

      <DsInput
        v-model="form.facebookStaffPauseHours"
        type="number"
        min="1"
        max="168"
        label="Ажилтан бичсэний дараа AI түр зогсох хугацаа"
        suffix="цаг"
        :error="pauseError"
      />
    </div>

    <p v-if="error" class="gks-fbs__error" role="alert">{{ error }}</p>

    <div class="gks-fbs__actions">
      <DsButton size="sm" variant="secondary" @click="emit('close')">Болих</DsButton>
      <DsButton type="submit" size="sm" variant="accent" icon-left="check" :loading="saving">Хадгалах</DsButton>
    </div>
  </form>
</template>

<style scoped>
.gks-fbs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-6);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-sunken);
}
.gks-fbs__head { display: flex; align-items: center; justify-content: space-between; }
.gks-fbs__title { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-fbs__close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.gks-fbs__close:hover { background: var(--surface-hover); }

.gks-fbs__grid { display: grid; grid-template-columns: 1.1fr 1.2fr .8fr; gap: var(--sp-5); align-items: start; }
.gks-fbs__switches { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-fbs__hint { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-fbs__error { font-size: var(--fs-micro); color: var(--danger-fg); }
.gks-fbs__actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }

@media (max-width: 1100px) {
  .gks-fbs { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-fbs__grid { grid-template-columns: 1fr; }
}
</style>
