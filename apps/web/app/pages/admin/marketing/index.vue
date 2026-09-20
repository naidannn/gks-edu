<script setup lang="ts">
import type { EmailCampaignItem, EmailCampaignStatus, PaginatedResult, SubscriberStats } from '@gks/shared';
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONE,
  MARKETING_AUDIENCE_LABELS,
} from '~/utils/marketing';

/**
 * 1O — mass mail. Every campaign the office has ever sent, newest first.
 *
 * The list leads with the counts rather than with the subject line: after a
 * send, the only question anybody asks of this screen is "did it go out, and
 * to how many" — the wording is one click away on the detail page.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Имэйл маркетинг · CRM' });

type Paginated = PaginatedResult<EmailCampaignItem>;

const STATUS_OPTIONS = selectOptions(CAMPAIGN_STATUS_LABELS, 'Бүх төлөв');

const api = useApi();
const status = ref<EmailCampaignStatus | ''>('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const stats = ref<SubscriberStats | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, subscriberStats] = await Promise.all([
      api.get<Paginated>('/marketing/campaigns', {
        query: { page: page.value, limit: 20, ...(status.value ? { status: status.value } : {}) },
      }),
      api.get<SubscriberStats>('/marketing/subscribers/stats').catch(() => null),
    ]);
    data.value = list;
    stats.value = subscriberStats;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

watch(status, () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

/** Sent of total, so a run that is still going reads as progress. */
function progress(campaign: EmailCampaignItem): string {
  if (campaign.status === 'DRAFT') return '—';
  return `${formatNumber(campaign.sentCount)} / ${formatNumber(campaign.totalCount)}`;
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Маркетинг</span>
        <h1 class="gks-page__title">Имэйл кампанит ажил</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} кампанит ажил</p>
      </div>
      <div class="gks-mk__head-actions">
        <DsButton variant="secondary" size="sm" icon-left="mail" @click="navigateTo('/admin/marketing/templates')">
          Загвар
        </DsButton>
        <DsButton variant="secondary" size="sm" icon-left="users" @click="navigateTo('/admin/marketing/subscribers')">
          Захиалагч
        </DsButton>
        <DsButton variant="accent" size="sm" icon-left="plus" @click="navigateTo('/admin/marketing/new')">
          Шинэ кампанит ажил
        </DsButton>
      </div>
    </header>

    <div v-if="stats" class="gks-mk__stats">
      <DsCard class="gks-mk__stat">
        <p class="gks-mk__stat-label">Захиалсан</p>
        <p class="gks-mk__stat-value gks-tnum">{{ formatNumber(stats.subscribed) }}</p>
      </DsCard>
      <DsCard class="gks-mk__stat">
        <p class="gks-mk__stat-label">Захиалгаас гарсан</p>
        <p class="gks-mk__stat-value gks-tnum">{{ formatNumber(stats.unsubscribed) }}</p>
      </DsCard>
      <DsCard class="gks-mk__stat">
        <p class="gks-mk__stat-label">Хүрээгүй хаяг</p>
        <p class="gks-mk__stat-value gks-tnum">{{ formatNumber(stats.bounced) }}</p>
      </DsCard>
    </div>

    <DsCard>
      <div class="gks-filters">
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Кампанит ажлуудыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 5" :key="n" class="gks-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">Кампанит ажил алга. «Шинэ кампанит ажил» товчоор эхлүүлнэ үү.</p>
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr><th>Нэр</th><th>Хүлээн авагч</th><th>Төлөв</th><th>Илгээсэн</th><th>Амжилтгүй</th><th>Огноо</th></tr>
        </thead>
        <tbody>
          <tr
            v-for="campaign in data.items"
            :key="campaign.id"
            class="gks-row"
            tabindex="0"
            @click="navigateTo(`/admin/marketing/${campaign.id}`)"
            @keydown.enter="navigateTo(`/admin/marketing/${campaign.id}`)"
          >
            <td data-label="Нэр">
              <p class="gks-mk__name">{{ campaign.name }}</p>
              <p class="gks-mk__subject">{{ campaign.subject }}</p>
            </td>
            <td data-label="Хүлээн авагч">{{ MARKETING_AUDIENCE_LABELS[campaign.audience] }}</td>
            <td data-label="Төлөв">
              <DsBadge :tone="CAMPAIGN_STATUS_TONE[campaign.status]">
                {{ CAMPAIGN_STATUS_LABELS[campaign.status] }}
              </DsBadge>
            </td>
            <td class="gks-tnum" data-label="Илгээсэн">{{ progress(campaign) }}</td>
            <td class="gks-tnum" data-label="Амжилтгүй">{{ campaign.failedCount || '—' }}</td>
            <td class="gks-tnum" data-label="Огноо">{{ formatNumericDate(campaign.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <DsPager v-model:page="page" :total-pages="totalPages" />
  </div>
</template>

<style scoped>
.gks-mk__head-actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-mk__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-3); }
.gks-mk__stat { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-mk__stat-label { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-mk__stat-value { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-mk__name { font-weight: var(--fw-semibold); }
.gks-mk__subject { font-size: var(--fs-micro); color: var(--text-subtle); }
</style>
