<script setup lang="ts">
import type { ProfileQuestionnaireView } from '@gks/shared';

/**
 * The client's «Нэмэлт мэдээллийн асуулга» on their card (1B-29): how far they
 * are, the answers so far, and the three things staff do with it — fill it in
 * for a family that brought the answers to the office, copy it into a school's
 * form, or send it back with a note.
 */
const props = defineProps<{ clientId: string }>();

const api = useApi();
const view = ref<ProfileQuestionnaireView | null>(null);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const busy = ref<string | null>(null);
const reopening = ref(false);
const reopenNote = ref('');

const base = computed(() => `/clients/${props.clientId}/profile-questionnaire`);

onMounted(async () => {
  try {
    view.value = await api.get<ProfileQuestionnaireView>(base.value);
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Асуулгыг ачаалж чадсангүй');
  }
});

async function run(key: string, action: () => Promise<unknown>, done?: string) {
  busy.value = key;
  actionError.value = null;
  notice.value = null;
  try {
    await action();
    if (done) notice.value = done;
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = null;
  }
}

const copy = () =>
  run('copy', async () => {
    await navigator.clipboard.writeText(await api.get<string>(`${base.value}/text`, { responseType: 'text' }));
  }, 'Хуулагдлаа.');

async function reopen() {
  if (!reopenNote.value.trim()) return;
  await run('reopen', async () => {
    view.value = await api.post<ProfileQuestionnaireView>(`${base.value}/reopen`, { note: reopenNote.value });
    reopening.value = false;
    reopenNote.value = '';
  }, 'Үйлчлүүлэгчид буцааж нээлээ.');
}

const status = computed(() => {
  const row = view.value?.questionnaire;
  if (!row) return { label: 'Эхлээгүй', tone: 'neutral' as const };
  if (row.status === 'SUBMITTED') return { label: 'Илгээсэн', tone: 'success' as const };
  return { label: 'Бөглөж байна', tone: 'warning' as const };
});
</script>

<template>
  <DsCard title="Нэмэлт мэдээллийн асуулга">
    <template #action>
      <DsBadge :tone="status.tone">{{ status.label }}</DsBadge>
    </template>

    <p v-if="loadError" class="gks-cpq__error">{{ loadError }}</p>
    <template v-else-if="view">
      <p class="gks-cpq__meta gks-tnum">
        {{ view.progress.answered }} / {{ view.progress.total }} асуултад хариулсан<template v-if="view.questionnaire?.submittedAt">
          · {{ formatDate(view.questionnaire.submittedAt) }}-нд илгээсэн</template>
      </p>

      <QuestionnaireAnswerList v-if="view.questionnaire" :definition="view.definition" :answers="view.questionnaire.answers" />
      <p v-else class="gks-cpq__meta">Үйлчлүүлэгч кабинетаасаа бөглөнө. Оффист ирсэн бол ажилтан энд бөглөж болно.</p>

      <div class="gks-cpq__actions">
        <DsButton size="sm" variant="secondary" icon-left="pencil" @click="navigateTo(`/admin/profile-questionnaires/${clientId}`)">
          {{ view.questionnaire ? 'Засах' : 'Бөглөх' }}
        </DsButton>
        <DsButton v-if="view.questionnaire" size="sm" variant="ghost" icon-left="copy" :loading="busy === 'copy'" @click="copy">
          Текстээр хуулах
        </DsButton>
        <DsButton
          v-if="view.questionnaire?.status === 'SUBMITTED' && !reopening"
          size="sm"
          variant="ghost"
          icon-left="undo-2"
          @click="reopening = true"
        >
          Буцааж нээх
        </DsButton>
      </div>

      <div v-if="reopening" class="gks-cpq__reopen">
        <DsTextarea v-model="reopenNote" label="Үйлчлүүлэгчид юуг нэмэх, засахыг бичнэ үү" :rows="2" />
        <div class="gks-cpq__actions">
          <DsButton size="sm" variant="accent" :loading="busy === 'reopen'" :disabled="!reopenNote.trim()" @click="reopen">
            Буцааж нээх
          </DsButton>
          <DsButton size="sm" variant="ghost" @click="reopening = false">Болих</DsButton>
        </div>
      </div>

      <p v-if="notice" class="gks-cpq__meta">{{ notice }}</p>
      <p v-if="actionError" class="gks-cpq__error">{{ actionError }}</p>
    </template>
  </DsCard>
</template>

<style scoped>
.gks-cpq__meta { margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-cpq__error { font-size: var(--fs-body-sm); color: var(--danger-fg); }
.gks-cpq__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-cpq__reopen { margin-top: var(--sp-4); }
</style>
