<script setup lang="ts">
import type { CaseConditions, DocumentStatus, OfficeAppointmentView } from '@gks/shared';

/**
 * The client's material checklist (1D-13/14/15): what is needed, why, what is
 * still missing, and the single office visit that closes out the originals
 * that cannot be sent online (1D-11).
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const caseId = computed(() => String(route.params.id));
const docs = useCaseDocuments(caseId);
const busy = ref(false);
const saving = ref(false);
const appointmentView = ref<OfficeAppointmentView | null>(null);
const bookingAt = ref('');
const bookingError = ref<string | null>(null);
const printing = ref(false);

/** The case shell resolves `/me/cases/:id`; the code names the printed file. */
const caseDetail = inject<{ gksCase: Ref<{ code: string } | null> } | null>('caseDetail', null);
const caseCode = computed(() => caseDetail?.gksCase.value?.code);

async function loadAppointments() {
  appointmentView.value = await docs.appointments();
}

onMounted(async () => {
  await docs.load();
  await loadAppointments();
});

async function withBusy(action: () => Promise<unknown>) {
  busy.value = true;
  try {
    await action();
  } catch (error) {
    docs.error.value = apiErrorMessage(error, 'Үйлдэл амжилтгүй боллоо');
  } finally {
    busy.value = false;
  }
}

async function onSaveConditions(payload: Partial<CaseConditions>) {
  saving.value = true;
  try {
    await docs.saveConditions(payload);
  } catch (error) {
    // The engine refuses to build a list before the prepayment is confirmed,
    // so the answer can come back rejected — say so instead of failing silently.
    docs.error.value = apiErrorMessage(error, 'Хариултыг хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

function onUpload(documentId: string, files: File[]) {
  return withBusy(() => docs.upload(documentId, files));
}

function onNote(documentId: string, body: string) {
  return withBusy(() => docs.addNote(documentId, body));
}

function onTransition(documentId: string, status: DocumentStatus) {
  return withBusy(() => docs.transition(documentId, status));
}

/** The same sheet the office prints (1D-21), from the client's own side. */
async function print() {
  printing.value = true;
  try {
    await docs.printChecklist(caseCode.value);
  } catch (error) {
    docs.error.value = apiErrorMessage(error, 'Жагсаалтыг хэвлэхэд алдаа гарлаа');
  } finally {
    printing.value = false;
  }
}

async function book() {
  bookingError.value = null;
  if (!bookingAt.value) return;
  try {
    await docs.bookAppointment(new Date(bookingAt.value).toISOString());
    bookingAt.value = '';
    await loadAppointments();
  } catch (error) {
    bookingError.value = apiErrorMessage(error, 'Товлолт үүсгэж чадсангүй');
  }
}

const openAppointment = computed(() => appointmentView.value?.appointments.find((a) => a.status === 'SCHEDULED') ?? null);
const originals = computed(() => appointmentView.value?.physicalOriginals ?? []);

/** An appointment slot, spelled out — this one screen wants the long month. */
function formatAppointmentAt(value: string): string {
  return new Date(value).toLocaleString('mn-MN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="gks-docs">
    <DsCard v-if="docs.checklist.value" padding="var(--sp-5)">
      <DocumentsProgressBar :progress="docs.checklist.value.progress" />
      <div v-if="docs.checklist.value.documents.length" class="gks-docs__print">
        <DsButton size="sm" variant="secondary" icon-left="printer" :loading="printing" @click="print">
          Жагсаалтаа хэвлэх
        </DsButton>
        <span class="gks-docs__print-hint">A4 хуудсаар хэвлээд гар дээрээ тэмдэглэж явж болно.</span>
      </div>
    </DsCard>

    <DocumentsConditionsForm :conditions="docs.conditions.value" :saving="saving" @save="onSaveConditions" />

    <p v-if="docs.error.value" class="gks-docs__error">{{ docs.error.value }}</p>

    <section v-if="docs.checklist.value?.documents.length" class="gks-docs__list">
      <DocumentsDocumentCard
        v-for="document in docs.checklist.value.documents"
        :key="document.id"
        :document="document"
        mode="client"
        :busy="busy"
        @upload="onUpload(document.id, $event)"
        @note="onNote(document.id, $event)"
        @transition="onTransition(document.id, $event)"
        @open="docs.openFile($event)"
      />
    </section>

    <DsCard v-else-if="!docs.pending.value" title="Материалын жагсаалт">
      <p class="gks-docs__empty">
        Нөхцөлөө бөглөсний дараа шаардлагатай материалын жагсаалт энд гарч ирнэ.
      </p>
    </DsCard>

    <!-- 1D-11: everything that must arrive on paper is handed over in one visit. -->
    <DsCard v-if="originals.length" title="Оффист авчрах материал" eyebrow="Нэг удаагийн ирэлт">
      <ul class="gks-docs__originals">
        <li v-for="item in originals" :key="item.id">
          <DsIcon name="briefcase" :size="14" /> {{ item.template.nameMn }}
        </li>
      </ul>

      <div v-if="openAppointment" class="gks-docs__booked">
        <DsIcon name="calendar-check" :size="16" />
        <span>{{ formatAppointmentAt(openAppointment.scheduledAt) }}-д товлогдсон</span>
      </div>
      <div v-else class="gks-docs__booking">
        <DsInput v-model="bookingAt" type="datetime-local" label="Ирэх цагаа сонгох" />
        <DsButton variant="accent" :disabled="!bookingAt" @click="book">Товлох</DsButton>
      </div>
      <p v-if="bookingError" class="gks-docs__error">{{ bookingError }}</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-docs { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-docs__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-docs__empty { color: var(--text-subtle); font-style: italic; }
.gks-docs__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-docs__print { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-4); }
.gks-docs__print-hint { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-docs__originals { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-docs__originals li { display: flex; align-items: center; gap: var(--sp-2); }
.gks-docs__booked {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--success-bg);
  border: var(--border-hair) solid var(--success-line);
  color: var(--success-fg);
  font-size: var(--fs-body-sm);
}
.gks-docs__booking { display: flex; align-items: flex-end; gap: var(--sp-3); margin-top: var(--sp-4); flex-wrap: wrap; }
</style>
