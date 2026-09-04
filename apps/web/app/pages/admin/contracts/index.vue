<script setup lang="ts">
import type { ContractListItem, ContractStatus } from '@gks/shared';

/** All contracts across cases — status filter, search (1C-18). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: ContractListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STATUS_OPTIONS: { value: ContractStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(CONTRACT_STATUS_LABELS) as [ContractStatus, string][]).map(([value, label]) => ({ value, label })),
];

const api = useApi();
const q = ref('');
const status = ref<ContractStatus | ''>('');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(status.value ? { status: status.value } : {}),
}));

const data = ref<Paginated | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    data.value = await api.get<Paginated>('/contracts', { query: query.value });
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}
watch(status, () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 350); });
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

function statusTone(s: ContractStatus): 'neutral' | 'info' | 'success' | 'danger' {
  if (s === 'ACTIVE' || s === 'COMPLETED') return 'success';
  if (s === 'TERMINATED') return 'danger';
  if (s === 'SIGNED') return 'info';
  return 'neutral';
}
function mnt(value: string): string { return formatMnt(Number(value)) ?? '—'; }
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
useHead({ title: 'Гэрээ · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-crm__title">Гэрээ</h1>
      <p v-if="data" class="gks-crm__count gks-tnum">{{ data.meta.total }} гэрээ</p>
    </header>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Хэргийн код, хэрэглэгчээр хайх…" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Гэрээний жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-crm__empty">Гэрээ олдсонгүй.</p></DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr><th>Хэрэг</th><th>Хэрэглэгч</th><th>Төрөл</th><th>Төлөв</th><th>Нийт төлбөр</th><th>Гарын үсэг</th></tr>
        </thead>
        <tbody>
          <tr v-for="c in data.items" :key="c.id" class="gks-crm__row" @click="navigateTo(`/admin/cases/${c.case.id}`)">
            <td class="gks-tnum">{{ c.case.code }}</td>
            <td>{{ c.user.name ?? c.user.email }}</td>
            <td>{{ CONTRACT_TYPE_LABELS[c.type] }}</td>
            <td><DsBadge :tone="statusTone(c.status)">{{ CONTRACT_STATUS_LABELS[c.status] }}</DsBadge></td>
            <td class="gks-tnum">{{ mnt(c.totalAmountSnapshot) }}</td>
            <td class="gks-tnum">{{ c.signedAt ? formatDate(c.signedAt) : '—' }}</td>
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
.gks-crm__filters { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-3); }
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
