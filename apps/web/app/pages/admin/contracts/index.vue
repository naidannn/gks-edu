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
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM · Үйл ажиллагаа</span>
        <h1 class="gks-page__title">Гэрээ</h1>
        <p class="gks-page__hint">Төлөвөөр нь шүүж, үйлчилгээ рүү орж дараагийн үйлдлээ гүйцэтгэнэ.</p>
      </div>
      <div class="gks-page__actions">
        <NuxtLink to="/admin/settings/contract-templates" class="contracts__template-link">
          <DsIcon name="file-cog" :size="16" />
          Гэрээний загвар
        </NuxtLink>
      </div>
    </header>

    <!-- Every tile is also the filter that isolates it. -->
    <section v-if="stats" class="gks-stats" aria-label="Гэрээний төлөвийн тойм">
      <button
        type="button"
        class="gks-stat"
        :class="{ 'gks-stat--active': !status }"
        @click="selectStatus('')"
      >
        <span>Бүгд</span><strong class="gks-tnum">{{ stats.total }}</strong>
      </button>
      <button
        v-for="item in STATUS_SUMMARY"
        :key="item"
        type="button"
        class="gks-stat"
        :class="[`gks-stat--${CONTRACT_STATUS_TONE[item]}`, { 'gks-stat--active': status === item }]"
        @click="selectStatus(item)"
      >
        <span>{{ CONTRACT_STATUS_LABELS[item] }}</span><strong class="gks-tnum">{{ stats.byStatus[item] ?? 0 }}</strong>
      </button>
    </section>

    <DsCard padding="var(--sp-5)">
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Үйлчилгээний код, нэр, имэйлээр хайх…  ( / )"
        />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Гэрээний төлөв" />
        <DsSelect v-model="type" :options="TYPE_OPTIONS" aria-label="Гэрээний төрөл" />
      </div>
      <div class="gks-toggles">
        <DsButton v-if="hasFilters" variant="ghost" size="sm" icon-left="x" @click="clearFilters">Шүүлтүүр цэвэрлэх</DsButton>
        <DsButton variant="ghost" size="sm" icon-left="refresh-cw" @click="load">Шинэчлэх</DsButton>
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Гэрээний жагсаалтыг ачаалж чадсангүй. Дахин оролдоно уу.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 8" :key="n" class="gks-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">{{ hasFilters ? 'Шүүлтэд тохирох гэрээ олдсонгүй.' : 'Бүртгэгдсэн гэрээ алга.' }}</p>
    </DsCard>

    <template v-else>
      <p class="gks-result-count gks-tnum">
        {{ data.meta.total }} гэрээ ·
        {{ (page - 1) * data.meta.limit + 1 }}–{{ Math.min(page * data.meta.limit, data.meta.total) }} харагдаж байна
      </p>

      <div class="gks-table-wrap">
        <table class="gks-table gks-table--cards">
          <thead>
            <tr>
              <th>Гэрээ / харилцагч</th>
              <th>Үйлчилгээ</th>
              <th>Төлөв</th>
              <th>Гэрээ</th>
              <th class="gks-table__num">Нийт дүн</th>
              <th aria-label="Нээх" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in data.items"
              :key="c.id"
              class="gks-row"
              tabindex="0"
              @click="navigateTo(`/admin/cases/${c.case.id}`)"
              @keydown.enter="navigateTo(`/admin/cases/${c.case.id}`)"
            >
              <td data-label="Харилцагч">
                <span>
                  <span class="gks-cell-name">{{ c.user.name ?? c.user.email }}</span>
                  <span class="gks-cell-sub gks-tnum">№ {{ c.number }} · {{ c.case.code }}</span>
                </span>
              </td>
              <td data-label="Үйлчилгээ">{{ SERVICE_LABELS[c.case.serviceType] }}</td>
              <td data-label="Төлөв"><DsBadge :tone="CONTRACT_STATUS_TONE[c.status]">{{ CONTRACT_STATUS_LABELS[c.status] }}</DsBadge></td>
              <td data-label="Гэрээ">
                <span>
                  <span class="gks-cell-name">{{ CONTRACT_TYPE_LABELS[c.type] }}</span>
                  <span class="gks-cell-sub gks-tnum">
                    {{ c.signedAt ? `Зурсан · ${contractDate(c)}` : `Үүссэн · ${contractDate(c)}` }}
                  </span>
                </span>
              </td>
              <td class="gks-table__num contracts__amount" data-label="Нийт дүн">{{ mnt(c.totalAmountSnapshot) }}</td>
              <td class="contracts__open"><DsIcon name="chevron-right" :size="18" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
.contracts__template-link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--brand-700);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  text-decoration: none;
  white-space: nowrap;
}
.contracts__template-link:hover { color: var(--brand-800); text-decoration: underline; }

.contracts__amount { font-weight: var(--fw-semibold); color: var(--text-strong); white-space: nowrap; }
.contracts__open { width: 32px; color: var(--text-subtle); }
.gks-row:hover .contracts__open { color: var(--brand-700); }
@media (max-width: 720px) { .contracts__open { display: none; } }
</style>
