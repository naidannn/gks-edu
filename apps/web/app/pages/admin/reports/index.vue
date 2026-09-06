<script setup lang="ts">
import type { FinanceReport, ManagementDashboard, SalesFunnelReport } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * 1G-09 — the management dashboard: the 21 figures of gksedu.md §19, in the
 * order the business lists them (харилцагч → санхүү → материал → процесс →
 * ажилтан/суваг).
 *
 * Everything comes from `/reports/*`, which reads the nightly materialized
 * views (1G-08). The refresh time is shown so nobody mistakes a night-old
 * number for a live one; the button forces a refresh when they need live.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Тайлан' });

const api = useApi();
const auth = useAuthStore();

const dashboard = ref<ManagementDashboard | null>(null);
const funnel = ref<SalesFunnelReport | null>(null);
const finance = ref<FinanceReport | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const refreshing = ref(false);
const refreshedAt = ref<Date | null>(null);

/** Finance is admin-only; a consultant gets the rest rather than an error page. */
const canSeeFinance = computed(() => auth.user?.role === 'ADMIN');

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    const [dash, fun, fin] = await Promise.all([
      api.get<ManagementDashboard>('/reports/dashboard'),
      api.get<SalesFunnelReport>('/reports/sales-funnel'),
      canSeeFinance.value ? api.get<FinanceReport>('/reports/finance').catch(() => null) : Promise.resolve(null),
    ]);
    dashboard.value = dash;
    funnel.value = fun;
    finance.value = fin;
  } catch {
    errorMsg.value = 'Тайланг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function refresh() {
  refreshing.value = true;
  try {
    await api.post('/reports/refresh');
    refreshedAt.value = new Date();
    await load();
  } catch {
    errorMsg.value = 'Шинэчлэлт амжилтгүй боллоо';
  } finally {
    refreshing.value = false;
  }
}

function mnt(value: number | null | undefined): string {
  return formatMnt(value ?? 0) ?? '0₮';
}

/** Bar width as a percentage of the largest value in the set. */
function share(value: number, max: number): string {
  return `${max > 0 ? Math.round((value / max) * 100) : 0}%`;
}

const maxSourceTotal = computed(() =>
  Math.max(1, ...(funnel.value?.bySource ?? []).map((row) => row.total)),
);
const maxMonthRevenue = computed(() =>
  Math.max(1, ...(finance.value?.byMonth ?? []).map((row) => row.revenue)),
);
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">§19</span>
        <h1 class="gks-page__title">Удирдлагын тайлан</h1>
        <p class="gks-page__hint">
          Тоонууд шөнө бүр шинэчлэгддэг материалжуулсан харагдацаас уншигдана.
          <span v-if="refreshedAt" class="gks-tnum">Сүүлд гараар шинэчилсэн: {{ refreshedAt.toLocaleTimeString('mn-MN') }}</span>
        </p>
      </div>
      <DsButton
        v-if="canSeeFinance"
        variant="secondary"
        size="sm"
        icon-left="refresh-cw"
        :disabled="refreshing"
        @click="refresh"
      >
        {{ refreshing ? 'Шинэчилж байна…' : 'Одоо шинэчлэх' }}
      </DsButton>
    </header>

    <p v-if="errorMsg" class="gks-reports__error">{{ errorMsg }}</p>
    <p v-if="pending" class="gks-reports__loading">Уншиж байна…</p>

    <template v-else-if="dashboard">
      <!-- Харилцагч ба борлуулалт -->
      <DsCard title="Харилцагч ба борлуулалт" eyebrow="1–6">
        <div class="gks-stats">
          <div class="gks-stat">
            <span class="gks-stat__label">Нийт боломжит харилцагч</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.totalLeads }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Энэ сард шинээр</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.newLeadsThisMonth }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Гэрээтэй хэрэглэгч</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.contractedClients }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Хөрвөлтийн хувь</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.conversionRate }}%</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Мэдүүлсэн сургууль</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.applicationsByUniversity }}</span>
          </div>
        </div>

        <div v-if="dashboard.salesByService.length" class="gks-table-wrap gks-table-wrap--auto">
          <table class="gks-table">
            <caption class="gks-table__caption">Үйлчилгээ тус бүрийн борлуулалт</caption>
            <thead>
              <tr><th scope="col">Үйлчилгээ</th><th scope="col" class="gks-table__num">Орлого</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in dashboard.salesByService" :key="row.serviceType">
                <td>{{ SERVICE_LABELS[row.serviceType] }}</td>
                <td class="gks-table__num gks-tnum">{{ mnt(row.revenue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DsCard>

      <!-- Санхүү -->
      <DsCard v-if="canSeeFinance" title="Санхүү" eyebrow="7–11">
        <div class="gks-stats">
          <div class="gks-stat">
            <span class="gks-stat__label">Нийт орлого</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.totalRevenue) }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Урьдчилгаа</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.prepaymentTotal) }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Үлдэгдэл</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.balanceTotal) }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Авлага</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.receivable) }}</span>
          </div>
          <div class="gks-stat gks-stat--warn">
            <span class="gks-stat__label">Хугацаа хэтэрсэн авлага</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.overdueReceivable) }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Буцаалт</span>
            <span class="gks-stat__value gks-tnum">{{ mnt(dashboard.refunded) }}</span>
          </div>
        </div>

        <div v-if="finance?.byMonth.length" class="gks-bars">
          <p class="gks-bars__title">Сараар (орлого)</p>
          <div v-for="row in finance.byMonth" :key="row.month" class="gks-bars__row">
            <span class="gks-bars__label gks-tnum">{{ row.month }}</span>
            <span class="gks-bars__track">
              <span class="gks-bars__fill" :style="{ width: share(row.revenue, maxMonthRevenue) }" />
            </span>
            <span class="gks-bars__value gks-tnum">{{ mnt(row.revenue) }}</span>
          </div>
        </div>
      </DsCard>

      <!-- Материал ба процесс -->
      <DsCard title="Материал ба процесс" eyebrow="12–19">
        <div class="gks-stats">
          <div class="gks-stat">
            <span class="gks-stat__label">Материал бүрдүүлж байгаа</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.collectingDocuments }}</span>
          </div>
          <div class="gks-stat" :class="{ 'gks-stat--warn': dashboard.overdueDocuments > 0 }">
            <span class="gks-stat__label">Хугацаа хэтэрсэн материал</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.overdueDocuments }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Сургуульд мэдүүлсэн</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.submittedToUniversity }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Тэнцсэн</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.admitted }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Татгалзсан</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.rejected }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Урилга авсан</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.invited }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Виз гарсан</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.visaApproved }}</span>
          </div>
          <div class="gks-stat">
            <span class="gks-stat__label">Солонгос руу явсан</span>
            <span class="gks-stat__value gks-tnum">{{ dashboard.departed }}</span>
          </div>
        </div>
      </DsCard>

      <!-- Суваг -->
      <DsCard title="Харилцагч орж ирсэн суваг" eyebrow="21">
        <p v-if="!dashboard.leadsBySource.length" class="gks-reports__empty">Сэжмийн мэдээлэл алга.</p>
        <div v-else class="gks-bars">
          <div v-for="row in dashboard.leadsBySource" :key="row.source" class="gks-bars__row">
            <span class="gks-bars__label">{{ LEAD_SOURCE_LABELS[row.source] }}</span>
            <span class="gks-bars__track">
              <span class="gks-bars__fill" :style="{ width: share(row.total, maxSourceTotal) }" />
            </span>
            <span class="gks-bars__value gks-tnum">{{ row.total }} · {{ row.conversionRate }}%</span>
          </div>
        </div>
      </DsCard>

      <!-- Ажилтан -->
      <DsCard title="Ажилтан тус бүрийн гүйцэтгэл" eyebrow="20">
        <p v-if="!dashboard.staffPerformance.length" class="gks-reports__empty">Ажилтны мэдээлэл алга.</p>
        <div v-else class="gks-table-wrap gks-table-wrap--auto">
          <table class="gks-table">
            <thead>
              <tr>
                <th scope="col">Ажилтан</th>
                <th scope="col">Эрх</th>
                <th scope="col" class="gks-table__num">Сэжим</th>
                <th scope="col" class="gks-table__num">Гэрээ</th>
                <th scope="col" class="gks-table__num">Хөрвөлт</th>
                <th scope="col" class="gks-table__num">Үйлчилгээ</th>
                <th scope="col" class="gks-table__num">Нээлттэй ажил</th>
                <th scope="col" class="gks-table__num">Хугацаа хэтэрсэн</th>
                <th v-if="canSeeFinance" scope="col" class="gks-table__num">Орлого</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in dashboard.staffPerformance" :key="row.staffId">
                <td>{{ row.name ?? row.email }}</td>
                <td>{{ ROLE_LABELS[row.role] ?? row.role }}</td>
                <td class="gks-table__num gks-tnum">{{ row.leadsAssigned }}</td>
                <td class="gks-table__num gks-tnum">{{ row.leadsWon }}</td>
                <td class="gks-table__num gks-tnum">{{ row.conversionRate }}%</td>
                <td class="gks-table__num gks-tnum">{{ row.casesAsConsultant + row.casesAsDocOfficer }}</td>
                <td class="gks-table__num gks-tnum">{{ row.openTasks }}</td>
                <td class="gks-table__num gks-tnum" :class="{ 'gks-table__num--warn': row.overdueTasks > 0 }">
                  {{ row.overdueTasks }}
                </td>
                <td v-if="canSeeFinance" class="gks-table__num gks-tnum">{{ mnt(row.revenueMnt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
/* Tables here follow a tile strip inside the same card. */
.gks-table-wrap { margin-top: var(--sp-4); }
.gks-reports__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-reports__loading,
.gks-reports__empty { color: var(--text-subtle); font-size: var(--fs-body-sm); }
.gks-bars { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-bars__title { font-size: var(--fs-micro); color: var(--text-subtle); text-transform: uppercase; letter-spacing: var(--ls-caps); }
.gks-bars__row { display: grid; grid-template-columns: 132px 1fr auto; align-items: center; gap: var(--sp-3); font-size: var(--fs-body-sm); }
.gks-bars__track { height: 8px; border-radius: var(--radius-pill); background: var(--line-hairline); overflow: hidden; }
.gks-bars__fill { display: block; height: 100%; background: var(--brand-600); }
.gks-bars__value { font-size: var(--fs-micro); color: var(--text-subtle); }
</style>

