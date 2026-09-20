<script setup lang="ts">
import type { EmailSubscriberItem, PaginatedResult, SubscriberStats, SubscriberStatus } from '@gks/shared';
import { SUBSCRIBER_STATUS_LABELS, SUBSCRIBER_STATUS_TONE } from '~/utils/marketing';

/**
 * 1O — the newsletter list, which is also the suppression list.
 *
 * An address that unsubscribed stays here forever as an `UNSUBSCRIBED` row —
 * that row is the record of their "no", and every audience checks it before a
 * send. Deleting it would let the next import quietly mail them again.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Захиалагч · CRM' });

type Paginated = PaginatedResult<EmailSubscriberItem>;

const STATUS_OPTIONS = selectOptions(SUBSCRIBER_STATUS_LABELS, 'Бүх төлөв');

const api = useApi();
const status = ref<SubscriberStatus | ''>('');
const search = ref('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const stats = ref<SubscriberStats | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);
const syncing = ref(false);

async function load() {
  pending.value = true;
  try {
    const [list, statsResult] = await Promise.all([
      api.get<Paginated>('/marketing/subscribers', {
        query: {
          page: page.value,
          limit: 25,
          ...(status.value ? { status: status.value } : {}),
          ...(search.value ? { search: search.value } : {}),
        },
      }),
      api.get<SubscriberStats>('/marketing/subscribers/stats').catch(() => null),
    ]);
    data.value = list;
    stats.value = statsResult;
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Захиалагчдыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

watch(status, () => { page.value = 1; load(); });
watch(page, load);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(() => { page.value = 1; load(); }, 350);
});
onBeforeUnmount(() => clearTimeout(timer));
onMounted(load);

async function setStatus(row: EmailSubscriberItem, next: SubscriberStatus) {
  try {
    const updated = await api.patch<EmailSubscriberItem>(`/marketing/subscribers/${row.id}`, { status: next });
    Object.assign(row, updated);
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Өөрчилж чадсангүй');
  }
}

/** Pushes the live list into Brevo, for campaigns the office builds there. */
async function sync() {
  syncing.value = true;
  errorMsg.value = null;
  try {
    const result = await api.post<{ synced: number; skipped: number }>('/marketing/subscribers/sync');
    notice.value = result.synced
      ? `${formatNumber(result.synced)} хаягийг Brevo руу илгээлээ.`
      : 'Brevo тохируулагдаагүй байна (BREVO_API_KEY, BREVO_LIST_ID).';
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Brevo руу илгээж чадсангүй');
  } finally {
    syncing.value = false;
  }
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Маркетинг</span>
        <h1 class="gks-page__title">Захиалагч</h1>
        <p v-if="stats" class="gks-result-count gks-tnum">
          {{ formatNumber(stats.subscribed) }} захиалсан ·
          {{ formatNumber(stats.unsubscribed) }} гарсан ·
          {{ formatNumber(stats.bounced) }} хүрээгүй
        </p>
      </div>
      <div class="gks-mk-s__head-actions">
        <DsButton variant="secondary" size="sm" icon-left="refresh-cw" :disabled="syncing" @click="sync">
          {{ syncing ? 'Илгээж байна…' : 'Brevo руу sync' }}
        </DsButton>
        <DsButton variant="secondary" size="sm" @click="navigateTo('/admin/marketing')">Кампанит ажил</DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-mk-s__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-mk-s__notice">{{ notice }}</p>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="search"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Имэйл, нэрээр хайх…  ( / )"
        />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
      </div>
    </DsCard>

    <p v-if="pending && !data" class="gks-page__hint">Уншиж байна…</p>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">Захиалагч олдсонгүй.</p>
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr><th>Имэйл</th><th>Нэр</th><th>Эх сурвалж</th><th>Төлөв</th><th>Бүртгэгдсэн</th><th>Brevo</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="row in data.items" :key="row.id">
            <td data-label="Имэйл">{{ row.email }}</td>
            <td data-label="Нэр">{{ row.name ?? '—' }}</td>
            <td data-label="Эх сурвалж">{{ row.source }}</td>
            <td data-label="Төлөв">
              <DsBadge :tone="SUBSCRIBER_STATUS_TONE[row.status]">
                {{ SUBSCRIBER_STATUS_LABELS[row.status] }}
              </DsBadge>
            </td>
            <td class="gks-tnum" data-label="Бүртгэгдсэн">{{ formatNumericDate(row.createdAt) }}</td>
            <td class="gks-tnum" data-label="Brevo">
              {{ row.brevoSyncedAt ? formatNumericDate(row.brevoSyncedAt) : '—' }}
            </td>
            <td data-label="">
              <DsButton
                v-if="row.status !== 'UNSUBSCRIBED'"
                variant="secondary"
                size="sm"
                @click="setStatus(row, 'UNSUBSCRIBED')"
              >
                Захиалгаас гаргах
              </DsButton>
              <DsButton v-else variant="secondary" size="sm" @click="setStatus(row, 'SUBSCRIBED')">
                Буцааж нэмэх
              </DsButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DsPager v-model:page="page" :total-pages="totalPages" />
  </div>
</template>

<style scoped>
.gks-mk-s__head-actions { display: flex; gap: var(--sp-2); }
.gks-mk-s__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-mk-s__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
</style>
