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
useHead({ title: 'Төлбөр · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-crm__title">Төлбөр</h1>
      <p v-if="data" class="gks-crm__count gks-tnum">{{ data.meta.total }} гүйлгээ</p>
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
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Хэргийн код, хэрэглэгчээр хайх…" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="kind" :options="KIND_OPTIONS" aria-label="Төрөл" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Төлбөрийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-crm__empty">Төлбөр олдсонгүй.</p></DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr><th>Хэрэг</th><th>Хэрэглэгч</th><th>Төрөл</th><th>Дүн</th><th>Төлөв</th><th>Огноо</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in data.items" :key="p.id" class="gks-crm__row" @click="navigateTo(`/admin/cases/${p.case.id}`)">
            <td class="gks-tnum">{{ p.case.code }}</td>
            <td>{{ p.case.user.name ?? p.case.user.email }}</td>
            <td>{{ PAYMENT_KIND_LABELS[p.kind] }}</td>
            <td class="gks-tnum">{{ mnt(p.amountMnt) }}</td>
            <td><DsBadge :tone="PAYMENT_STATUS_TONE[p.status]">{{ PAYMENT_STATUS_LABELS[p.status] }}</DsBadge></td>
            <td class="gks-tnum">{{ formatDateTime(p.paidAt ?? p.createdAt) }}</td>
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
.gks-crm { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-crm__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-crm__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-receivables { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-3); }
.gks-receivables__card { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-receivables__label { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-receivables__value { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-receivables__count { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-crm__filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: var(--sp-3); }
.gks-crm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-crm__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-crm__empty { text-align: center; color: var(--text-muted); }
.gks-crm__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); background: var(--surface-sunken); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-crm__row { cursor: pointer; }
.gks-crm__row:hover { background: var(--surface-sunken); }
.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 900px) {
  .gks-crm__filters { grid-template-columns: 1fr; }
}
</style>
