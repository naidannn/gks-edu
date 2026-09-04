<script setup lang="ts">
import type { DocumentStatus, VisaView } from '@gks/shared';

/**
 * 1F-08 — the client's visa page: where the case stands, the visa document
 * checklist, and the standing guidance for applying in person (§10).
 */
definePageMeta({ middleware: 'auth' });

const route = useRoute();
const api = useApi();
const caseId = computed(() => String(route.params.id));

const view = ref<VisaView | null>(null);
const pending = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const docs = useCaseDocuments(caseId);
docs.stage.value = 'VISA';

async function load() {
  pending.value = true;
  try {
    view.value = await api.get<VisaView>(`/cases/${caseId.value}/visa`);
    if (view.value?.visaCase) await docs.load();
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function withBusy(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

const visaCase = computed(() => view.value?.visaCase ?? null);

/** Standing advice (1F-04) — the client applies in person, GKS prepares the file. */
const GUIDE = [
  { icon: 'calendar-clock', title: 'Цаг захиалах', body: 'БНСУ-ын Элчин сайдын яамны цахим системээр цагаа урьдчилан авна. Цаг ойрын хугацаанд дүүрдэг тул материал бэлэн болмогц захиална.' },
  { icon: 'folder-check', title: 'Материалаа бүрэн авч очих', body: 'Жагсаалтын материалыг эх хувь болон хуулбарын хамт, дарааллаар нь эмхэлж авч очно. Дутуу материалтай очвол дахин цаг авах шаардлага гарна.' },
  { icon: 'wallet', title: 'Санхүүгийн нотлох баримт', body: 'Дансны үлдэгдлийн баталгааг мэдүүлэхээс 1 сарын дотор авсан байх ёстой. Шаардагдах дүнг ажилтан тань танд хэлж өгнө.' },
  { icon: 'messages-square', title: 'Ярилцлагын бэлтгэл', body: 'Суралцах шалтгаан, сургууль, төлбөрөө хэн санхүүжүүлэх талаар товч, тодорхой хариулна. Бид урьдчилан дадлага хийлгэнэ.' },
];

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
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
</script>

<template>
  <div class="gks-visa">
    <DsCard v-if="visaCase" title="Визний явц">
      <template #action>
        <DsBadge :tone="VISA_STATUS_TONE[visaCase.status]">{{ VISA_STATUS_LABELS[visaCase.status] }}</DsBadge>
      </template>

      <dl class="gks-visa__facts">
        <div>
          <dt>Визний төрөл</dt>
          <dd>{{ VISA_TYPE_LABELS[visaCase.visaType] }}</dd>
        </div>
        <div>
          <dt>Цаг захиалга</dt>
          <dd class="gks-tnum">{{ formatDateTime(visaCase.appointmentAt) }}</dd>
        </div>
        <div v-if="visaCase.visaNumber">
          <dt>Визний дугаар</dt>
          <dd class="gks-tnum">{{ visaCase.visaNumber }}</dd>
        </div>
      </dl>

      <p v-if="visaCase.status === 'APPROVED'" class="gks-visa__approved">
        <DsIcon name="party-popper" :size="16" /> Виз гарлаа. Явахын өмнөх бэлтгэлийн чеклист нээгдсэн.
      </p>
      <p v-else-if="visaCase.status === 'REJECTED'" class="gks-visa__rejected">
        <DsIcon name="circle-x" :size="16" /> {{ visaCase.rejectionReason }}
      </p>
    </DsCard>

    <DsCard v-else-if="!pending" title="Виз">
      <p class="gks-visa__empty">Сургуулийн урилга ирснээр визний үе шат нээгдэнэ.</p>
    </DsCard>

    <template v-if="visaCase">
      <DsCard v-if="docs.checklist.value" padding="var(--sp-5)">
        <DocumentsProgressBar :progress="docs.checklist.value.progress" label="Визний материал" />
      </DsCard>

      <p v-if="error" class="gks-visa__error">{{ error }}</p>

      <section v-if="docs.checklist.value?.documents.length" class="gks-visa__list">
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

      <DsCard title="Виз мэдүүлэх заавар" eyebrow="Та өөрөө мэдүүлнэ — материалыг бид бэлтгэнэ">
        <ul class="gks-visa__guide">
          <li v-for="step in GUIDE" :key="step.title">
            <DsIcon :name="step.icon" :size="18" />
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.body }}</p>
            </div>
          </li>
        </ul>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-visa { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-visa__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-4); }
.gks-visa__facts dt { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
.gks-visa__facts dd { font-size: var(--fs-body-sm); color: var(--text-body); margin-top: 2px; }

.gks-visa__approved, .gks-visa__rejected {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
}
.gks-visa__approved { background: var(--success-bg); border: var(--border-hair) solid var(--success-line); color: var(--success-fg); }
.gks-visa__rejected { background: var(--danger-bg); border: var(--border-hair) solid var(--danger-line); color: var(--danger-fg); }

.gks-visa__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-visa__empty { color: var(--text-subtle); font-style: italic; }
.gks-visa__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-visa__guide { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-visa__guide li { display: flex; gap: var(--sp-3); align-items: flex-start; }
.gks-visa__guide h3 { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-visa__guide p { margin-top: 2px; font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>
