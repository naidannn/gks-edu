<script setup lang="ts">
import type { CaseDetail } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/** View → accept → SMS OTP → signed, or a physical-contract status view (1C-17). */
definePageMeta({ middleware: 'auth' });

const { gksCase, reload } = inject('caseDetail') as { gksCase: Ref<CaseDetail | null>; reload: () => Promise<void> };
const api = useApi();
const errorMsg = ref<string | null>(null);

const contract = computed(() => gksCase.value?.contract ?? null);

// --- Accept + OTP ---
const phone = ref('');
const accepting = ref(false);
async function accept() {
  if (!contract.value || !phone.value.trim()) return;
  errorMsg.value = null;
  accepting.value = true;
  try {
    await api.post(`/contracts/${contract.value.id}/accept`, { phone: phone.value.trim() });
    await reload();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Хүсэлт амжилтгүй боллоо';
  } finally {
    accepting.value = false;
  }
}

const otpCode = ref('');
const verifying = ref(false);
async function verify() {
  if (!contract.value || otpCode.value.length !== 6) return;
  errorMsg.value = null;
  verifying.value = true;
  try {
    await api.post(`/contracts/${contract.value.id}/verify-otp`, { code: otpCode.value });
    otpCode.value = '';
    await reload();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Код буруу байна';
  } finally {
    verifying.value = false;
  }
}

const downloading = ref(false);
async function downloadPdf() {
  if (!contract.value) return;
  downloading.value = true;
  try {
    const { downloadUrl } = await api.get<{ downloadUrl: string }>(`/contracts/${contract.value.id}/pdf`);
    const config = useRuntimeConfig();
    const base = String(config.public.apiBase).replace(/\/api\/v1$/, '');
    window.open(`${base}${downloadUrl}`, '_blank');
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'PDF татаж чадсангүй';
  } finally {
    downloading.value = false;
  }
}

const isSigned = computed(() => contract.value && ['SIGNED', 'ACTIVE', 'COMPLETED'].includes(contract.value.status));
</script>

<template>
  <div class="gks-contract">
    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>

    <DsCard v-if="!contract" title="Гэрээ">
      <p class="gks-contract__unknown">Танд одоогоор гэрээ үүсээгүй байна — зөвлөхтэйгээ холбогдоно уу.</p>
    </DsCard>

    <template v-else>
      <DsCard title="Гэрээний нөхцөл">
        <pre class="gks-contract__body">{{ contract.bodyMn }}</pre>
      </DsCard>

      <DsCard v-if="isSigned" title="Гарын үсэг зурагдсан">
        <p class="gks-contract__signed">Гэрээ баталгаажсан.</p>
        <DsButton v-if="contract.pdfPath" size="sm" variant="secondary" :loading="downloading" @click="downloadPdf">PDF татах</DsButton>
      </DsCard>

      <DsCard v-else-if="contract.type === 'ELECTRONIC' && !contract.acceptedAt" title="Зөвшөөрөх">
        <DsInput v-model="phone" label="Утасны дугаар" placeholder="99112233" />
        <DsButton class="gks-contract__action" :disabled="!phone.trim()" :loading="accepting" @click="accept">
          Зөвшөөрч, баталгаажуулах код авах
        </DsButton>
      </DsCard>

      <DsCard v-else-if="contract.type === 'ELECTRONIC'" title="Баталгаажуулах">
        <p class="gks-contract__hint">Таны утсанд илгээсэн 6 оронтой кодыг оруулна уу.</p>
        <DsInput v-model="otpCode" label="Баталгаажуулах код" maxlength="6" />
        <DsButton class="gks-contract__action" :disabled="otpCode.length !== 6" :loading="verifying" @click="verify">
          Баталгаажуулах
        </DsButton>
      </DsCard>

      <DsCard v-else title="Биет гэрээ">
        <p class="gks-contract__unknown">Ажилтан таны биет гэрээг бүртгэх хүртэл хүлээнэ үү.</p>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-contract { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-contract__body { white-space: pre-wrap; font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-body); }
.gks-contract__unknown { color: var(--text-subtle); font-style: italic; }
.gks-contract__signed { color: var(--text-strong); font-weight: var(--fw-medium); margin-bottom: var(--sp-3); }
.gks-contract__hint { font-size: var(--fs-body-sm); color: var(--text-muted); margin-bottom: var(--sp-3); }
.gks-contract__action { margin-top: var(--sp-3); }
</style>
