<script setup lang="ts">
import type { PortalCaseDetail } from '@gks/shared';

/**
 * The client's own contract screen (1C-08, 1C-23): read the terms → agree →
 * confirm the code mailed to the account's address (1C-33) → the signed PDF.
 * A physical contract is read-only here; the office registers it after it is
 * signed on paper (1C-09).
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const { gksCase, reload } = inject('caseDetail') as { gksCase: Ref<PortalCaseDetail | null>; reload: () => Promise<void> };
const api = useApi();
const config = useRuntimeConfig();
const { overview, refresh } = usePortal();
const errorMsg = ref<string | null>(null);
const noticeMsg = ref<string | null>(null);

const contract = computed(() => gksCase.value?.contract ?? null);
const isSigned = computed(() => Boolean(contract.value && ['SIGNED', 'ACTIVE', 'COMPLETED'].includes(contract.value.status)));

// ── Step 1: agree, which mails the OTP ─────────────────────────────────────
// The address is the one the account is registered under — it is shown, never
// typed, because a code sent to an address supplied at signing time would
// verify nothing.
const agreed = ref(false);
const accepting = ref(false);
const sentTo = ref<string | null>(null);
const email = computed(() => sentTo.value ?? overview.value?.account.email ?? null);

async function sendCode(): Promise<boolean> {
  if (!contract.value) return false;
  errorMsg.value = null;
  noticeMsg.value = null;
  accepting.value = true;
  try {
    const { email: to } = await api.post<{ sent: boolean; email: string }>(`/contracts/${contract.value.id}/accept`);
    sentTo.value = to;
    // Nothing on screen changes on a resend, so without this the button just
    // stops spinning and the client cannot tell whether anything happened.
    noticeMsg.value = `Шинэ код ${to} хаяг руу илгээлээ.`;
    return true;
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хүсэлт амжилтгүй боллоо');
    return false;
  } finally {
    accepting.value = false;
  }
}

async function accept() {
  if (!agreed.value) return;
  // Only reload on success: a failed send leaves `acceptedAt` unwritten on
  // purpose, so the screen must stay on this step rather than move to a code
  // that is not coming.
  if (await sendCode()) await reload();
}

// ── Step 2: the six-digit code ──────────────────────────────────────────────
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
    await refresh();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Код буруу байна');
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
    const base = String(config.public.apiBase).replace(/\/api\/v1$/, '');
    window.open(`${base}${downloadUrl}`, '_blank', 'noopener');
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'PDF татаж чадсангүй');
  } finally {
    downloading.value = false;
  }
}
</script>

<template>
  <div class="gks-contract">
    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>
    <DsCard v-else-if="noticeMsg"><p>{{ noticeMsg }}</p></DsCard>

    <DsCard v-if="!contract" title="Гэрээ">
      <p class="gks-contract__unknown">
        Энэ үйлчилгээнд гэрээ хараахан үүсээгүй байна. Шинээр үйлчилгээ эхлүүлэх бол доорх товчийг дарна уу.
      </p>
      <DsButton variant="accent" class="gks-contract__action" @click="navigateTo('/app/start')">
        Үйлчилгээ эхлүүлэх
      </DsButton>
    </DsCard>

    <template v-else>
      <DsCard title="Гэрээний үндсэн нөхцөл">
        <dl class="gks-contract__terms">
          <div><dt>Гэрээний дугаар</dt><dd class="gks-tnum">{{ contract.number }}</dd></div>
          <div><dt>Гэрээний төрөл</dt><dd>{{ CONTRACT_TYPE_LABELS[contract.type] }}</dd></div>
          <div><dt>Төлөв</dt><dd>{{ CONTRACT_STATUS_LABELS[contract.status] }}</dd></div>
          <div><dt>Нийт төлбөр</dt><dd class="gks-tnum">{{ formatMntAmount(contract.totalAmountSnapshot) }}</dd></div>
          <div>
            <dt>Үлдэгдлийн нөхцөл</dt>
            <dd>{{ BALANCE_TRIGGER_LABELS[contract.balanceTriggerSnapshot] }}</dd>
          </div>
          <div v-if="contract.signedAt"><dt>Гарын үсэг зурсан</dt><dd>{{ formatLongDate(contract.signedAt) }}</dd></div>
        </dl>
      </DsCard>

      <DsCard title="Гэрээний бүрэн эх" class="gks-contract__sheet">
        <ContractDocument
          :body="contract.bodyMn"
          :number="contract.number"
          :date="contract.createdAt"
        />
      </DsCard>

      <DsCard v-if="isSigned" title="Гэрээ баталгаажсан">
        <p class="gks-contract__signed">
          <DsIcon name="circle-check" :size="18" /> Таны зуучлалын гэрээ хүчин төгөлдөр болсон.
        </p>
        <div class="gks-contract__row">
          <DsButton v-if="contract.pdfPath" size="sm" variant="secondary" icon-left="download" :loading="downloading" @click="downloadPdf">
            PDF татах
          </DsButton>
          <DsButton size="sm" variant="accent" icon-right="arrow-right" @click="navigateTo(`/app/cases/${gksCase?.id}/payment`)">
            Урьдчилгаа төлбөр рүү
          </DsButton>
        </div>
      </DsCard>

      <DsCard v-else-if="contract.type === 'ELECTRONIC' && !contract.acceptedAt" title="Зөвшөөрөх" accent>
        <p class="gks-contract__hint">
          Дээрх нөхцөлийг уншиж танилцсаны дараа зөвшөөрнө үү. Бүртгэлийн имэйл хаяг руу тань
          6 оронтой баталгаажуулах код очно.
        </p>
        <p v-if="email" class="gks-contract__hint">
          Код очих хаяг: <strong>{{ email }}</strong>
        </p>
        <DsCheckbox
          v-model="agreed"
          class="gks-contract__agree"
          label="Би гэрээний нөхцөлийг уншиж танилцсан бөгөөд зөвшөөрч байна."
        />
        <DsButton
          class="gks-contract__action"
          variant="accent"
          :disabled="!agreed"
          :loading="accepting"
          @click="accept"
        >
          Зөвшөөрч, баталгаажуулах код авах
        </DsButton>
      </DsCard>

      <DsCard v-else-if="contract.type === 'ELECTRONIC'" title="Баталгаажуулах" accent>
        <p class="gks-contract__hint">
          <template v-if="email"><strong>{{ email }}</strong> хаяг руу илгээсэн</template>
          <template v-else>Имэйл хаяг руу тань илгээсэн</template>
          6 оронтой кодыг оруулна уу. Код 5 минутын хугацаатай — ирээгүй бол спам хавтсаа шалгаарай.
        </p>
        <DsInput v-model="otpCode" label="Баталгаажуулах код" maxlength="6" inputmode="numeric" />
        <div class="gks-contract__row">
          <DsButton variant="accent" :disabled="otpCode.length !== 6" :loading="verifying" @click="verify">
            Баталгаажуулах
          </DsButton>
          <DsButton variant="ghost" size="sm" :loading="accepting" @click="sendCode">Код дахин илгээх</DsButton>
        </div>
      </DsCard>

      <DsCard v-else title="Биет гэрээ">
        <p class="gks-contract__unknown">
          Гэрээг оффист гарын үсэг зурсны дараа ажилтан бүртгэнэ. Бүртгэгдмэгц энд харагдана.
        </p>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-contract { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-contract__terms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-contract__terms dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-contract__terms dd { margin-top: 2px; font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }

.gks-contract__sheet :deep(.gks-doc) { max-height: 520px; overflow-y: auto; }
.gks-contract__unknown { color: var(--text-subtle); font-style: italic; }
.gks-contract__signed { display: flex; align-items: center; gap: var(--sp-2); color: var(--success-fg); font-weight: var(--fw-medium); margin-bottom: var(--sp-4); }
.gks-contract__hint { font-size: var(--fs-body-sm); color: var(--text-muted); margin-bottom: var(--sp-4); line-height: var(--lh-body); }
.gks-contract__agree { margin-top: var(--sp-4); }
.gks-contract__action { margin-top: var(--sp-4); }
.gks-contract__row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }

@media (max-width: 700px) {
  .gks-contract__terms { grid-template-columns: 1fr; }
}
</style>
