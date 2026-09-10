<script setup lang="ts">
import type { AdmissionConfig } from '@gks/shared';

/**
 * Admissions configuration (1H-02).
 *
 * These are the office's *current* values, not constants — the same principle
 * as `ServicePricing` and the ranking weights (CLAUDE.md). Changing the lead
 * time recomputes every automatic internal deadline; the ones staff pinned by
 * hand are left alone, which is what makes the box safe to touch.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Элсэлтийн тохиргоо · Админ' });

const api = useApi();

const config = ref<AdmissionConfig | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMsg = ref<string | null>(null);
const savedAt = ref<number | null>(null);

const leadDays = ref('7');
const clientOffsets = ref('');
const staffOffsets = ref('');
const riskThreshold = ref('80');
const researchModel = ref('');
const programResearchModel = ref('');

function fill(value: AdmissionConfig) {
  leadDays.value = String(value.internalLeadDays);
  clientOffsets.value = value.clientReminderOffsets.join(', ');
  staffOffsets.value = value.staffReminderOffsets.join(', ');
  riskThreshold.value = String(value.riskReadinessThreshold);
  researchModel.value = value.researchModel;
  programResearchModel.value = value.programResearchModel;
}

async function load() {
  loading.value = true;
  try {
    const result = await api.get<AdmissionConfig>('/admin/admissions/config');
    config.value = result;
    fill(result);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Тохиргоог ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** "30, 14, 7" → [30, 14, 7]; anything unparseable is dropped, not defaulted. */
function parseOffsets(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isInteger(part) && part >= 0 && part <= 365);
}

const parsedClientOffsets = computed(() => parseOffsets(clientOffsets.value));
const parsedStaffOffsets = computed(() => parseOffsets(staffOffsets.value));

/** Shows the rule against a concrete date so nobody has to do the arithmetic. */
const example = computed(() => {
  const days = Number.parseInt(leadDays.value, 10);
  if (!Number.isInteger(days)) return null;
  const schoolDeadline = new Date(Date.UTC(new Date().getFullYear() + 1, 0, 31));
  const ours = new Date(schoolDeadline.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    school: schoolDeadline.toISOString().slice(0, 10),
    ours: ours.toISOString().slice(0, 10),
    days,
  };
});

async function save() {
  saving.value = true;
  errorMsg.value = null;
  try {
    const result = await api.patch<AdmissionConfig>('/admin/admissions/config', {
      internalLeadDays: Number.parseInt(leadDays.value, 10),
      clientReminderOffsets: parsedClientOffsets.value,
      staffReminderOffsets: parsedStaffOffsets.value,
      riskReadinessThreshold: Number.parseInt(riskThreshold.value, 10),
      researchModel: researchModel.value.trim(),
      programResearchModel: programResearchModel.value.trim(),
    });
    config.value = result;
    fill(result);
    savedAt.value = Date.now();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="gks-page gks-adm-config">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Тохиргоо</span>
        <h1 class="gks-page__title">Элсэлтийн тохиргоо</h1>
        <p class="gks-page__hint">
          Эдгээр нь тогтмол утга биш, өнөөдрийн бодлого — үнийн тохиргоо, эрэмбийн жинтэй адилаар
        деплой хийхгүйгээр өөрчилнө.
        </p>
      </div>
    </header>

    <DsCard v-if="loading">Ачаалж байна…</DsCard>

    <template v-else>
      <DsCard title="Манай бүртгэлийн эцсийн хугацаа">
        <p class="gks-adm-config__note">
          Сургуулийн эцсийн хугацаанаас хэдэн хоногийн өмнө бид өөрсдийн бүртгэлээ хаах вэ. Орчуулга,
          нотариат, сургуульд хүргүүлэх хугацааг энэ зөрүү хамардаг.
        </p>
        <DsInput v-model="leadDays" label="Хоногийн зөрүү" type="number" min="0" max="180" />
        <p v-if="example" class="gks-adm-config__example">
          Жишээ: сургуулийн эцсийн хугацаа <strong class="gks-tnum">{{ example.school }}</strong> бол
          манай хугацаа <strong class="gks-tnum">{{ example.ours }}</strong> болно
          ({{ example.days }} хоногийн өмнө).
        </p>
        <p class="gks-adm-config__warn">
          <DsIcon name="triangle-alert" :size="15" />
          Энэ утгыг өөрчлөхөд <strong>автоматаар бодогддог</strong> бүх элсэлтийн хугацаа дахин бодогдоно.
          Ажилтан гараар тавьсан огноонууд хэвээр үлдэнэ.
        </p>
      </DsCard>

      <DsCard title="Сануулгын хуваарь">
        <p class="gks-adm-config__note">
          Манай эцсийн хугацаанаас хэдэн хоногийн өмнө сануулга явуулах вэ. Таслалаар тусгаарлана.
        </p>
        <div class="gks-form-grid">
          <div>
            <DsInput v-model="clientOffsets" label="Үйлчлүүлэгчид" placeholder="30, 14, 7, 3, 1" />
            <p class="gks-adm-config__hint gks-tnum">→ {{ parsedClientOffsets.join(', ') || 'сануулга явуулахгүй' }}</p>
          </div>
          <div>
            <DsInput v-model="staffOffsets" label="Хариуцсан ажилтанд" placeholder="21, 14, 7, 3, 1" />
            <p class="gks-adm-config__hint gks-tnum">→ {{ parsedStaffOffsets.join(', ') || 'сануулга явуулахгүй' }}</p>
          </div>
        </div>
        <DsInput
          v-model="riskThreshold"
          label="Эрсдэлийн босго (материалын бүрдэлт %)"
          type="number"
          min="0"
          max="100"
        />
        <p class="gks-adm-config__note">
          Материалын бүрдэлт энэ хувиас доогуур байхад хариуцсан зөвлөх, материалын ажилтанд
          "элсэлтээ алдаж болзошгүй" сануулга очно.
        </p>
      </DsCard>

      <DsCard title="Интернэтээс судлах">
        <p class="gks-adm-config__note">
          Хоёр судалгаа өөр ажил тул загвар нь ч тусдаа. Түлхүүр тохируулаагүй бол систем
          хуурамч (mock) хариу буцаана — судалгаа биш гэдгийг үр дүн дээр нь бичиж өгдөг.
          Google хайлт одоогоор унтраалттай (эрх дууссан) тул хоёулаа зөвхөн загварын
          мэдлэгээр хариулж, бүх санал <strong>LOW</strong> болж ирнэ.
        </p>
        <div class="gks-form-grid">
          <DsInput
            v-model="researchModel"
            label="Элсэлтийн хугацаа — загвар"
            placeholder="gemini-3.1-flash-lite"
            hint="deepseek- гэж эхэлбэл DeepSeek рүү, бусад нь Gemini рүү очно. -pro загварууд үнэгүй эрхгүй тул 429 өгдөг — gemini-3.1-flash-lite найдвартай."
          />
          <DsInput
            v-model="programResearchModel"
            label="Хөтөлбөр, төлбөр — загвар"
            placeholder="deepseek-v4-flash"
            hint="deepseek- гэж эхэлбэл DeepSeek рүү очно. Хайлт байхгүй тул бүх санал LOW."
          />
        </div>
      </DsCard>

      <p v-if="errorMsg" class="gks-adm-config__error">{{ errorMsg }}</p>

      <footer class="gks-form-actions">
        <p v-if="config" class="gks-adm-config__hint">
          Сүүлд шинэчилсэн: {{ formatDateTime(config.updatedAt) }}
          <span v-if="config.updatedBy?.name"> · {{ config.updatedBy.name }}</span>
        </p>
        <span v-if="savedAt" class="gks-adm-config__saved">Хадгаллаа</span>
        <DsButton variant="accent" icon-left="check" :loading="saving" @click="save">Хадгалах</DsButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
/* A settings form is read, not scanned: it keeps a reading width even on a
   wide monitor. */
.gks-adm-config { max-width: 860px; }
.gks-adm-config__note { margin-bottom: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-body-sm); line-height: 1.6; }
.gks-form-grid { margin-bottom: var(--sp-4); }
.gks-adm-config__hint { margin-top: var(--sp-2); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-adm-config__example { margin-top: var(--sp-3); padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-caption); }
.gks-adm-config__example strong { color: var(--brand-700); }
.gks-adm-config__warn { display: flex; align-items: flex-start; gap: var(--sp-2); margin-top: var(--sp-3); color: var(--text-muted); font-size: var(--fs-caption); line-height: 1.6; }
.gks-adm-config__warn .gks-icon { flex: none; margin-top: 2px; color: var(--amber-700); }
.gks-adm-config__error { color: var(--red-700); font-size: var(--fs-body-sm); }
.gks-form-actions .gks-adm-config__hint { margin: 0; margin-right: auto; }
.gks-adm-config__saved { color: var(--green-700); font-size: var(--fs-body-sm); }

</style>
