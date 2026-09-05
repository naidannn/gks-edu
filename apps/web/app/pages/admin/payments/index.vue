<script setup lang="ts">
import type { PaymentKind, PaymentListItem, PaymentStats, PaymentStatus } from '@gks/shared';

/** All payments across cases + a receivables summary (1C-18). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: PaymentListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STATUS_OPTIONS: { value: PaymentStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(PAYMENT_STATUS_LABELS) as [PaymentStatus, string][]).map(([value, label]) => ({ value, label })),
];
const KIND_OPTIONS: { value: PaymentKind | ''; label: string }[] = [
  { value: '', label: 'Бүх төрөл' },
  ...(Object.entries(PAYMENT_KIND_LABELS) as [PaymentKind, string][]).map(([value, label]) => ({ value, label })),
];

const api = useApi();
const q = ref('');
const status = ref<PaymentStatus | ''>('');
const kind = ref<PaymentKind | ''>('');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(kind.value ? { kind: kind.value } : {}),
}));

const data = ref<Paginated | null>(null);
const stats = ref<PaymentStats | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, statsResult] = await Promise.all([
      api.get<Paginated>('/payments', { query: query.value }),
      api.get<PaymentStats>('/payments/stats'),
    ]);
    data.value = list;
    stats.value = statsResult;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}
watch([status, kind], () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 350); });
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

function mnt(value: string | number): string { return formatMnt(Number(value)) ?? '—'; }
function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
/* Filters live in the URL: a filtered queue can be bookmarked, shared and
   survives a refresh. */
useUrlFilters({
  q,
  status: [status, STATUS_OPTIONS.map((o) => o.value)],
  kind: [kind, KIND_OPTIONS.map((o) => o.value)],
});

useHead({ title: 'Төлбөр · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Төлбөр</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} гүйлгээ</p>
      </div>
    </header>

    <div v-if="stats" class="gks-receivables">
      <DsCard v-for="row in stats.pendingByKind" :key="row.kind" class="gks-receivables__card">
        <p class="gks-receivables__label">{{ PAYMENT_KIND_LABELS[row.kind] }} · хүлээгдэж буй</p>
        <p class="gks-receivables__value gks-tnum">{{ mnt(row.totalMnt) }}</p>
        <p class="gks-receivables__count gks-tnum">{{ row.count }} гүйлгээ</p>
      </DsCard>
      <DsCard class="gks-receivables__card">
        <p class="gks-receivables__label">Хугацаа хэтэрсэн</p>
        <p class="gks-receivables__value gks-tnum">{{ stats.overdueCount }}</p>
      </DsCard>
    </div>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Хэргийн код, хэрэглэгчээр хайх…  ( / )"
        />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="kind" :options="KIND_OPTIONS" aria-label="Төрөл" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Төлбөрийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-empty">Төлбөр олдсонгүй.</p></DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr><th>Хэрэг</th><th>Хэрэглэгч</th><th>Төрөл</th><th>Дүн</th><th>Төлөв</th><th>Огноо</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in data.items" :key="p.id" class="gks-row" tabindex="0" @click="navigateTo(`/admin/cases/${p.case.id}`)" @keydown.enter="navigateTo(`/admin/cases/${p.case.id}`)">
            <td class="gks-tnum" data-label="Хэрэг">{{ p.case.code }}</td>
            <td data-label="Хэрэглэгч">{{ p.case.user.name ?? p.case.user.email }}</td>
            <td data-label="Төрөл">{{ PAYMENT_KIND_LABELS[p.kind] }}</td>
            <td class="gks-tnum" data-label="Дүн">{{ mnt(p.amountMnt) }}</td>
            <td data-label="Төлөв"><DsBadge :tone="PAYMENT_STATUS_TONE[p.status]">{{ PAYMENT_STATUS_LABELS[p.status] }}</DsBadge></td>
            <td class="gks-tnum" data-label="Огноо">{{ formatDateTime(p.paidAt ?? p.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
.gks-receivables { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-3); }
.gks-receivables__card { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-receivables__label { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-receivables__value { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-receivables__count { font-size: var(--fs-caption); color: var(--text-muted); }
</style>

