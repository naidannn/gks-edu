<script setup lang="ts">
import type { ContractListItem, ContractStats, ContractStatus, ContractType } from '@gks/shared';

/** Dense contracts workspace for staff handling signing and follow-up work (1C-18). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: ContractListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STATUS_OPTIONS: { value: ContractStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(CONTRACT_STATUS_LABELS) as [ContractStatus, string][]).map(([value, label]) => ({ value, label })),
];
const TYPE_OPTIONS: { value: ContractType | ''; label: string }[] = [
  { value: '', label: 'Бүх төрөл' },
  ...(Object.entries(CONTRACT_TYPE_LABELS) as [ContractType, string][]).map(([value, label]) => ({ value, label })),
];
const STATUS_SUMMARY: ContractStatus[] = ['DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'TERMINATED'];

const api = useApi();
const q = ref('');
const status = ref<ContractStatus | ''>('');
const type = ref<ContractType | ''>('');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 30,
  ...(q.value ? { q: q.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(type.value ? { type: type.value } : {}),
}));

const data = ref<Paginated | null>(null);
const stats = ref<ContractStats | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, summary] = await Promise.all([
      api.get<Paginated>('/contracts', { query: query.value }),
      api.get<ContractStats>('/contracts/stats'),
    ]);
    data.value = list;
    stats.value = summary;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

function selectStatus(value: ContractStatus | '') {
  status.value = status.value === value ? '' : value;
}
function clearFilters() {
  q.value = '';
  status.value = '';
  type.value = '';
}

watch([status, type], () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

function statusTone(s: ContractStatus): 'neutral' | 'info' | 'success' | 'danger' {
  if (s === 'ACTIVE' || s === 'COMPLETED') return 'success';
  if (s === 'TERMINATED') return 'danger';
  if (s === 'SIGNED' || s === 'SENT') return 'info';
  return 'neutral';
}
function mnt(value: string): string { return formatMnt(Number(value)) ?? '—'; }
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function contractDate(c: ContractListItem): string { return formatDate(c.signedAt ?? c.createdAt); }

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const hasFilters = computed(() => Boolean(q.value || status.value || type.value));
useHead({ title: 'Гэрээ · CRM' });
</script>

<template>
  <div class="contracts-workspace">
    <header class="contracts-workspace__head">
      <div>
        <span class="gks-eyebrow">CRM · Үйл ажиллагаа</span>
        <div class="contracts-workspace__title-row">
          <h1 class="contracts-workspace__title">Гэрээ</h1>
          <span v-if="stats" class="contracts-workspace__total gks-tnum">Нийт {{ stats.total }}</span>
        </div>
        <p class="contracts-workspace__hint">Төлөвөөр нь шүүж, хэрэг рүү орж дараагийн үйлдлээ гүйцэтгэнэ.</p>
      </div>
      <NuxtLink to="/admin/settings/contract-templates" class="contracts-workspace__template-link">
        <DsIcon name="file-cog" :size="16" />
        Гэрээний загвар
      </NuxtLink>
    </header>

    <section v-if="stats" class="contracts-summary" aria-label="Гэрээний төлөвийн тойм">
      <button
        class="contracts-summary__item"
        :class="{ 'contracts-summary__item--active': !status }"
        type="button"
        @click="selectStatus('')"
      >
        <span>Бүгд</span><strong class="gks-tnum">{{ stats.total }}</strong>
      </button>
      <button
        v-for="item in STATUS_SUMMARY"
        :key="item"
        class="contracts-summary__item"
        :class="[`contracts-summary__item--${statusTone(item)}`, { 'contracts-summary__item--active': status === item }]"
        type="button"
        @click="selectStatus(item)"
      >
        <span>{{ CONTRACT_STATUS_LABELS[item] }}</span><strong class="gks-tnum">{{ stats.byStatus[item] ?? 0 }}</strong>
      </button>
    </section>

    <section class="contracts-controls" aria-label="Гэрээ хайх ба шүүх">
      <DsInput v-model="q" icon-left="search" type="search" placeholder="Хэргийн код, нэр, имэйлээр хайх…" />
      <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Гэрээний төлөв" />
      <DsSelect v-model="type" :options="TYPE_OPTIONS" aria-label="Гэрээний төрөл" />
      <button v-if="hasFilters" type="button" class="contracts-controls__reset" @click="clearFilters">
        <DsIcon name="x" :size="15" /> Арилгах
      </button>
      <button type="button" class="contracts-controls__refresh" aria-label="Жагсаалт шинэчлэх" title="Жагсаалт шинэчлэх" @click="load">
        <DsIcon name="refresh-cw" :size="17" />
      </button>
    </section>

    <DsCard v-if="error" accent><p>Гэрээний жагсаалтыг ачаалж чадсангүй. Дахин оролдоно уу.</p></DsCard>
    <div v-else-if="pending && !data" class="contracts-skeleton">
      <div v-for="n in 8" :key="n" class="contracts-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="contracts-empty">{{ hasFilters ? 'Шүүлтэд тохирох гэрээ олдсонгүй.' : 'Бүртгэгдсэн гэрээ алга.' }}</p>
    </DsCard>

    <section v-else class="contracts-list" aria-label="Гэрээний жагсаалт">
      <div class="contracts-list__bar">
        <p><strong class="gks-tnum">{{ data.meta.total }}</strong> гэрээ олдлоо</p>
        <p class="contracts-list__page gks-tnum">{{ (page - 1) * data.meta.limit + 1 }}–{{ Math.min(page * data.meta.limit, data.meta.total) }} / {{ data.meta.total }}</p>
      </div>
      <div class="contracts-list__scroll">
        <table class="contracts-table">
          <thead>
            <tr><th>Хэрэг / харилцагч</th><th>Үйлчилгээ</th><th>Төлөв</th><th>Гэрээ</th><th class="contracts-table__amount">Нийт дүн</th><th aria-label="Нээх" /></tr>
          </thead>
          <tbody>
            <tr v-for="c in data.items" :key="c.id" class="contracts-table__row" tabindex="0" @click="navigateTo(`/admin/cases/${c.case.id}`)" @keydown.enter="navigateTo(`/admin/cases/${c.case.id}`)">
              <td>
                <div class="contracts-table__person">
                  <strong>{{ c.user.name ?? c.user.email }}</strong>
                  <span class="gks-tnum">{{ c.case.code }}</span>
                </div>
              </td>
              <td>{{ SERVICE_LABELS[c.case.serviceType] }}</td>
              <td><DsBadge :tone="statusTone(c.status)">{{ CONTRACT_STATUS_LABELS[c.status] }}</DsBadge></td>
              <td>
                <div class="contracts-table__detail">
                  <span>{{ CONTRACT_TYPE_LABELS[c.type] }}</span>
                  <span class="gks-tnum">{{ c.signedAt ? `Зурсан · ${contractDate(c)}` : `Үүссэн · ${contractDate(c)}` }}</span>
                </div>
              </td>
              <td class="contracts-table__amount gks-tnum">{{ mnt(c.totalAmountSnapshot) }}</td>
              <td class="contracts-table__open"><DsIcon name="chevron-right" :size="18" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <nav v-if="totalPages > 1" class="contracts-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="contracts-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
.contracts-workspace { display: flex; flex-direction: column; gap: var(--sp-4); }
.contracts-workspace__head { display: flex; align-items: end; justify-content: space-between; gap: var(--sp-4); }
.contracts-workspace__title-row { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); }
.contracts-workspace__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.contracts-workspace__total { padding: 3px var(--sp-2); border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
.contracts-workspace__hint { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.contracts-workspace__template-link { display: inline-flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) 0; color: var(--brand-700); font-size: var(--fs-caption); font-weight: var(--fw-semibold); text-decoration: none; white-space: nowrap; }
.contracts-workspace__template-link:hover { color: var(--brand-800); text-decoration: underline; }

.contracts-summary { display: grid; grid-template-columns: 1.1fr repeat(6, minmax(0, 1fr)); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-2); overflow: hidden; background: var(--surface-card); }
.contracts-summary__item { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; padding: var(--sp-3) var(--sp-4); border: 0; border-right: var(--border-hair) solid var(--line-hairline); background: transparent; color: var(--text-subtle); font: inherit; text-align: left; cursor: pointer; transition: var(--transition-control); }
.contracts-summary__item:last-child { border-right: 0; }
.contracts-summary__item span { overflow: hidden; max-width: 100%; font-size: var(--fs-micro); text-overflow: ellipsis; white-space: nowrap; }
.contracts-summary__item strong { color: var(--text-strong); font-size: var(--fs-h4); line-height: 1.1; }
.contracts-summary__item:hover { background: var(--surface-hover); }
.contracts-summary__item--active { box-shadow: inset 0 -2px 0 var(--brand-600); background: var(--surface-selected); }
.contracts-summary__item--info strong { color: var(--brand-700); }
.contracts-summary__item--success strong { color: var(--green-700); }
.contracts-summary__item--danger strong { color: var(--red-700); }

.contracts-controls { display: grid; grid-template-columns: minmax(240px, 2fr) minmax(150px, 1fr) minmax(145px, 1fr) auto auto; align-items: center; gap: var(--sp-2); }
.contracts-controls__reset, .contracts-controls__refresh { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: var(--control-md); border: 0; border-radius: var(--radius-2); background: transparent; color: var(--text-muted); font: inherit; font-size: var(--fs-caption); cursor: pointer; }
.contracts-controls__reset { padding: 0 var(--sp-2); }
.contracts-controls__refresh { width: var(--control-md); }
.contracts-controls__reset:hover, .contracts-controls__refresh:hover { background: var(--surface-hover); color: var(--text-strong); }

.contracts-list { border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-2); overflow: hidden; background: var(--surface-card); }
.contracts-list__bar { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); min-height: 38px; padding: 0 var(--sp-4); background: var(--surface-sunken); border-bottom: var(--border-hair) solid var(--line-hairline); color: var(--text-muted); font-size: var(--fs-caption); }
.contracts-list__bar strong { color: var(--text-strong); }
.contracts-list__scroll { overflow-x: auto; }
.contracts-table { width: 100%; min-width: 840px; border-collapse: collapse; font-size: var(--fs-body-sm); }
.contracts-table th { padding: var(--sp-2) var(--sp-4); color: var(--text-subtle); font-size: var(--fs-micro); font-weight: var(--fw-semibold); letter-spacing: var(--ls-caps-tight); text-align: left; text-transform: uppercase; white-space: nowrap; }
.contracts-table td { padding: var(--sp-2) var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); vertical-align: middle; }
.contracts-table__row { cursor: pointer; outline: none; transition: background var(--dur-fast) var(--ease-standard); }
.contracts-table__row:hover, .contracts-table__row:focus-visible { background: var(--surface-hover); }
.contracts-table__person, .contracts-table__detail { display: flex; flex-direction: column; gap: 2px; }
.contracts-table__person strong { color: var(--text-strong); font-weight: var(--fw-semibold); }
.contracts-table__person span, .contracts-table__detail span:last-child { color: var(--text-subtle); font-size: var(--fs-caption); }
.contracts-table__detail span:first-child { color: var(--text-muted); font-size: var(--fs-caption); }
.contracts-table__amount { text-align: right; font-weight: var(--fw-semibold); color: var(--text-strong); white-space: nowrap; }
.contracts-table__open { width: 32px; padding-left: 0 !important; color: var(--text-subtle); }
.contracts-table__row:hover .contracts-table__open { color: var(--brand-700); }

.contracts-skeleton { display: flex; flex-direction: column; gap: var(--sp-1); }
.contracts-skeleton__row { height: 50px; border: var(--border-hair) solid var(--line-hairline); background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050)); }
.contracts-empty { text-align: center; color: var(--text-muted); }
.contracts-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.contracts-pager__status { color: var(--text-muted); font-size: var(--fs-body-sm); }

@media (max-width: 1100px) {
  .contracts-summary { grid-template-columns: repeat(4, 1fr); }
  .contracts-summary__item:nth-child(4) { border-right: 0; }
  .contracts-summary__item:nth-child(-n + 4) { border-bottom: var(--border-hair) solid var(--line-hairline); }
}
@media (max-width: 720px) {
  .contracts-workspace__head { align-items: flex-start; flex-direction: column; gap: var(--sp-2); }
  .contracts-summary { grid-template-columns: repeat(2, 1fr); }
  .contracts-summary__item { border-right: var(--border-hair) solid var(--line-hairline) !important; border-bottom: var(--border-hair) solid var(--line-hairline); }
  .contracts-summary__item:nth-child(even) { border-right: 0 !important; }
  .contracts-summary__item:nth-last-child(-n + 1) { border-bottom: 0; }
  .contracts-controls { grid-template-columns: 1fr 1fr auto; }
  .contracts-controls > :first-child { grid-column: 1 / -1; }
  .contracts-controls__reset { justify-self: start; }
  .contracts-list__page { display: none; }
}
</style>
