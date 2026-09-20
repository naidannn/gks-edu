<script setup lang="ts">
import type {
  CampaignPreview,
  CampaignRecipientItem,
  CampaignRecipientStatus,
  EmailCampaignItem,
  MarketingTemplateItem,
  PaginatedResult,
} from '@gks/shared';
import { campaignPayload, formFromCampaign, validateCampaign } from '~/utils/campaign-form';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONE,
  MARKETING_AUDIENCE_LABELS,
  RECIPIENT_STATUS_LABELS,
  RECIPIENT_STATUS_TONE,
  isCampaignRunning,
} from '~/utils/marketing';
import { useAuthStore } from '~/stores/auth';

/**
 * 1O — one campaign: edit it while it is a draft, watch it while it runs, read
 * it afterwards.
 *
 * Sending asks twice on purpose. There is no undo for a mass mail — the second
 * press is the last moment the recipient count can still be read, so the count
 * is what the confirmation shows, not the campaign's name.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const route = useRoute();
const api = useApi();
const id = route.params.id as string;

const campaign = ref<EmailCampaignItem | null>(null);
const templates = ref<MarketingTemplateItem[]>([]);
const form = ref(formFromCampaign({ filters: {} } as EmailCampaignItem));
const errors = ref<Record<string, string>>({});
const pending = ref(true);
const loadFailed = ref(false);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const isDraft = computed(() => campaign.value?.status === 'DRAFT');

async function load() {
  try {
    campaign.value = await api.get<EmailCampaignItem>(`/marketing/campaigns/${id}`);
    form.value = formFromCampaign(campaign.value);
  } catch {
    loadFailed.value = true;
  } finally {
    pending.value = false;
  }
}

onMounted(async () => {
  await load();
  templates.value = await api.get<MarketingTemplateItem[]>('/marketing/templates').catch(() => []);
  await loadRecipients();
});

useHead(() => ({ title: `${campaign.value?.name ?? 'Кампанит ажил'} · CRM` }));

// ── Draft editing ──────────────────────────────────────────────────────────

async function save() {
  errors.value = validateCampaign(form.value);
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  errorMsg.value = null;
  try {
    campaign.value = await api.patch<EmailCampaignItem>(
      `/marketing/campaigns/${id}`,
      campaignPayload(form.value),
    );
    notice.value = 'Хадгалагдлаа.';
    preview.value = null;
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  try {
    await api.delete(`/marketing/campaigns/${id}`);
    await navigateTo('/admin/marketing');
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Устгаж чадсангүй');
  }
}

// ── Preview and test ───────────────────────────────────────────────────────

const preview = ref<CampaignPreview | null>(null);
const previewing = ref(false);

async function loadPreview() {
  previewing.value = true;
  errorMsg.value = null;
  try {
    preview.value = await api.get<CampaignPreview>(`/marketing/campaigns/${id}/preview`);
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Урьдчилан харж чадсангүй');
  } finally {
    previewing.value = false;
  }
}

const auth = useAuthStore();
const testEmail = ref('');
const testing = ref(false);

watchEffect(() => {
  // The address the person is logged in with is nearly always the one they
  // want the test at.
  if (!testEmail.value && auth.user?.email) testEmail.value = auth.user.email;
});

async function sendTest() {
  testing.value = true;
  errorMsg.value = null;
  try {
    await api.post(`/marketing/campaigns/${id}/test`, { email: testEmail.value });
    notice.value = `${testEmail.value} рүү тест илгээлээ.`;
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Тест илгээж чадсангүй');
  } finally {
    testing.value = false;
  }
}

// ── Sending ────────────────────────────────────────────────────────────────

const confirming = ref(false);
const sending = ref(false);
const audienceCount = ref<number | null>(null);

async function askToSend() {
  confirming.value = true;
  audienceCount.value = null;
  try {
    const result = await api.post<{ total: number }>('/marketing/audience/preview', {
      audience: campaign.value?.audience,
      filters: campaign.value?.filters ?? {},
    });
    audienceCount.value = result.total;
  } catch {
    audienceCount.value = null;
  }
}

async function send() {
  sending.value = true;
  errorMsg.value = null;
  try {
    const result = await api.post<{ total: number }>(`/marketing/campaigns/${id}/send`);
    notice.value = `${formatNumber(result.total)} хүнд илгээж эхэллээ.`;
    confirming.value = false;
    await load();
    await loadRecipients();
    startPolling();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Илгээж чадсангүй');
  } finally {
    sending.value = false;
  }
}

async function cancel() {
  try {
    await api.post(`/marketing/campaigns/${id}/cancel`);
    notice.value = 'Үлдсэн илгээлтийг зогсоолоо.';
    await load();
    await loadRecipients();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Зогсоож чадсангүй');
  }
}

// ── Recipients ─────────────────────────────────────────────────────────────

const recipientStatus = ref<CampaignRecipientStatus | ''>('');
const recipients = ref<PaginatedResult<CampaignRecipientItem> | null>(null);
const recipientPage = ref(1);

const RECIPIENT_OPTIONS = selectOptions(RECIPIENT_STATUS_LABELS, 'Бүгд');

async function loadRecipients() {
  if (!campaign.value || campaign.value.status === 'DRAFT') return;
  recipients.value = await api
    .get<PaginatedResult<CampaignRecipientItem>>(`/marketing/campaigns/${id}/recipients`, {
      query: {
        page: recipientPage.value,
        limit: 25,
        ...(recipientStatus.value ? { status: recipientStatus.value } : {}),
      },
    })
    .catch(() => null);
}

watch(recipientStatus, () => { recipientPage.value = 1; loadRecipients(); });
watch(recipientPage, loadRecipients);

/** While a run is live the screen refreshes itself — nobody should have to press F5 to watch a send. */
let poll: ReturnType<typeof setInterval> | undefined;

function startPolling() {
  clearInterval(poll);
  poll = setInterval(async () => {
    await load();
    await loadRecipients();
    if (campaign.value && !isCampaignRunning(campaign.value.status)) clearInterval(poll);
  }, 5000);
}

watch(
  () => campaign.value?.status,
  (status) => { if (status && isCampaignRunning(status)) startPolling(); },
);
onBeforeUnmount(() => clearInterval(poll));

const progressPercent = computed(() => {
  const row = campaign.value;
  if (!row || !row.totalCount) return 0;
  return Math.round(((row.sentCount + row.failedCount + row.skippedCount) / row.totalCount) * 100);
});
</script>

<template>
  <div class="gks-page">
    <p v-if="pending" class="gks-page__hint">Уншиж байна…</p>
    <DsCard v-else-if="loadFailed" accent><p>Кампанит ажлыг ачаалж чадсангүй.</p></DsCard>

    <template v-else-if="campaign">
      <header class="gks-page__head">
        <div class="gks-page__heading">
          <span class="gks-eyebrow">Маркетинг</span>
          <h1 class="gks-page__title">{{ campaign.name }}</h1>
          <p class="gks-page__hint">
            {{ MARKETING_AUDIENCE_LABELS[campaign.audience] }} ·
            {{ formatNumericDate(campaign.createdAt) }}
            <template v-if="campaign.createdBy"> · {{ campaign.createdBy.name ?? campaign.createdBy.email }}</template>
          </p>
        </div>
        <div class="gks-mk-d__head-actions">
          <DsBadge :tone="CAMPAIGN_STATUS_TONE[campaign.status]">
            {{ CAMPAIGN_STATUS_LABELS[campaign.status] }}
          </DsBadge>
          <DsButton variant="secondary" size="sm" @click="navigateTo('/admin/marketing')">Жагсаалт</DsButton>
        </div>
      </header>

      <p v-if="errorMsg" class="gks-mk-d__error">{{ errorMsg }}</p>
      <p v-if="notice" class="gks-mk-d__notice">{{ notice }}</p>

      <!-- Progress — the only thing worth looking at once a run has started. -->
      <DsCard v-if="campaign.status !== 'DRAFT'" title="Илгээлтийн явц">
        <div class="gks-mk-d__counts">
          <span>Нийт: <strong class="gks-tnum">{{ formatNumber(campaign.totalCount) }}</strong></span>
          <span>Илгээсэн: <strong class="gks-tnum">{{ formatNumber(campaign.sentCount) }}</strong></span>
          <span>Амжилтгүй: <strong class="gks-tnum">{{ formatNumber(campaign.failedCount) }}</strong></span>
          <span>Алгассан: <strong class="gks-tnum">{{ formatNumber(campaign.skippedCount) }}</strong></span>
        </div>
        <div class="gks-mk-d__bar" role="progressbar" :aria-valuenow="progressPercent" aria-valuemin="0" aria-valuemax="100">
          <div class="gks-mk-d__bar-fill" :style="{ width: `${progressPercent}%` }" />
        </div>
        <p v-if="campaign.failReason" class="gks-mk-d__error">{{ campaign.failReason }}</p>
        <div v-if="isCampaignRunning(campaign.status)" class="gks-mk-d__actions">
          <DsButton variant="secondary" size="sm" icon-left="circle-stop" @click="cancel">
            Үлдсэнийг нь зогсоох
          </DsButton>
        </div>
      </DsCard>

      <!-- Draft: the form, the preview, the test, then the send. -->
      <template v-if="isDraft">
        <MarketingCampaignFields v-model="form" :errors="errors" :templates="templates" />

        <div class="gks-mk-d__actions">
          <DsButton variant="accent" :disabled="saving" @click="save">
            {{ saving ? 'Хадгалж байна…' : 'Хадгалах' }}
          </DsButton>
          <DsButton variant="secondary" :disabled="previewing" @click="loadPreview">
            Урьдчилан харах
          </DsButton>
          <DsButton variant="secondary" @click="remove">Устгах</DsButton>
        </div>

        <DsCard v-if="preview" :title="`Урьдчилсан харагдац — ${preview.subject}`">
          <!-- `srcdoc` in a sandboxed frame: the campaign's own HTML must not
               borrow the CRM's styles, and it must not run anything either. -->
          <iframe
            class="gks-mk-d__preview"
            title="Имэйлийн урьдчилсан харагдац"
            sandbox=""
            :srcdoc="preview.html"
          />
        </DsCard>

        <DsCard title="Тест илгээх" eyebrow="Заавал">
          <p class="gks-page__hint">
            Хүмүүс рүү илгээхийн өмнө өөр рүүгээ илгээж, гар утсан дээр хэрхэн харагдахыг шалгаарай.
          </p>
          <div class="gks-mk-d__test">
            <DsInput v-model="testEmail" type="email" placeholder="ta@gksedu.mn" aria-label="Тест хаяг" />
            <DsButton variant="secondary" :disabled="testing || !testEmail" @click="sendTest">
              {{ testing ? 'Илгээж байна…' : 'Тест илгээх' }}
            </DsButton>
          </div>
        </DsCard>

        <DsCard title="Илгээх" accent>
          <template v-if="!confirming">
            <p class="gks-page__hint">
              Илгээсний дараа буцаах боломжгүй. Хадгалсан хувилбар илгээгдэнэ.
            </p>
            <div class="gks-mk-d__actions">
              <DsButton variant="accent" icon-left="send" @click="askToSend">Илгээх</DsButton>
            </div>
          </template>
          <template v-else>
            <p class="gks-mk-d__confirm">
              <template v-if="audienceCount === null">Хүлээн авагчийг тоолж байна…</template>
              <template v-else>
                <strong class="gks-tnum">{{ formatNumber(audienceCount) }}</strong> хүн рүү
                «{{ campaign.subject }}» гарчигтай захидал илгээх гэж байна. Үргэлжлүүлэх үү?
              </template>
            </p>
            <div class="gks-mk-d__actions">
              <DsButton variant="accent" :disabled="sending || !audienceCount" @click="send">
                {{ sending ? 'Илгээж байна…' : 'Тийм, илгээх' }}
              </DsButton>
              <DsButton variant="secondary" @click="confirming = false">Болих</DsButton>
            </div>
          </template>
        </DsCard>
      </template>

      <!-- Sent: what went out, and to whom. -->
      <template v-else>
        <DsCard title="Илгээсэн захидал">
          <dl class="gks-mk-d__meta">
            <div><dt>Гарчиг</dt><dd>{{ campaign.subject }}</dd></div>
            <div v-if="campaign.heading"><dt>Том гарчиг</dt><dd>{{ campaign.heading }}</dd></div>
            <div v-if="campaign.ctaUrl"><dt>Товч</dt><dd>{{ campaign.ctaLabel }} → {{ campaign.ctaUrl }}</dd></div>
          </dl>
          <pre class="gks-mk-d__body">{{ campaign.bodyMn }}</pre>
        </DsCard>

        <DsCard title="Хүлээн авагчид">
          <div class="gks-filters">
            <DsSelect v-model="recipientStatus" :options="RECIPIENT_OPTIONS" aria-label="Төлөв" />
          </div>

          <p v-if="!recipients?.items.length" class="gks-empty">Хүлээн авагч алга.</p>
          <div v-else class="gks-table-wrap">
            <table class="gks-table gks-table--cards">
              <thead><tr><th>Имэйл</th><th>Нэр</th><th>Төлөв</th><th>Огноо</th><th>Тайлбар</th></tr></thead>
              <tbody>
                <tr v-for="row in recipients.items" :key="row.id">
                  <td data-label="Имэйл">{{ row.email }}</td>
                  <td data-label="Нэр">{{ row.name ?? '—' }}</td>
                  <td data-label="Төлөв">
                    <DsBadge :tone="RECIPIENT_STATUS_TONE[row.status]">
                      {{ RECIPIENT_STATUS_LABELS[row.status] }}
                    </DsBadge>
                  </td>
                  <td class="gks-tnum" data-label="Огноо">{{ row.sentAt ? formatNumericDate(row.sentAt) : '—' }}</td>
                  <td data-label="Тайлбар" class="gks-mk-d__reason">{{ row.error ?? '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <DsPager v-model:page="recipientPage" :total-pages="recipients?.meta.totalPages ?? 1" />
        </DsCard>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-mk-d__head-actions { display: flex; align-items: center; gap: var(--sp-3); }
.gks-mk-d__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-mk-d__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-mk-d__actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-top: var(--sp-3); }
.gks-mk-d__counts { display: flex; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-body-sm); }
.gks-mk-d__bar {
  margin-top: var(--sp-3);
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  overflow: hidden;
}
.gks-mk-d__bar-fill { height: 100%; background: var(--brand-500); transition: width .3s ease; }
.gks-mk-d__preview { width: 100%; height: 640px; border: 0; background: #fff; }
.gks-mk-d__test { display: flex; gap: var(--sp-3); align-items: flex-end; flex-wrap: wrap; }
.gks-mk-d__confirm { font-size: var(--fs-body-sm); }
.gks-mk-d__meta { display: grid; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.gks-mk-d__meta div { display: flex; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-mk-d__meta dt { color: var(--text-subtle); min-width: 110px; }
.gks-mk-d__body {
  white-space: pre-wrap;
  font-family: inherit;
  font-size: var(--fs-body-sm);
  color: var(--text-body);
  margin: 0;
}
.gks-mk-d__reason { font-size: var(--fs-micro); color: var(--text-subtle); }
</style>
