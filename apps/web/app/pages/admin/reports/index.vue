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
  <div class="gks-reports">
    <header class="gks-reports__head">
      <div>
        <span class="gks-eyebrow">§19</span>
        <h1 class="gks-reports__title">Удирдлагын тайлан</h1>
        <p class="gks-reports__note">
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
        <div class="gks-reports__tiles">
          <div class="gks-tile">
            <span class="gks-tile__label">Нийт боломжит харилцагч</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.totalLeads }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Энэ сард шинээр</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.newLeadsThisMonth }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Гэрээтэй хэрэглэгч</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.contractedClients }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Хөрвөлтийн хувь</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.conversionRate }}%</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Мэдүүлсэн сургууль</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.applicationsByUniversity }}</span>
          </div>
        </div>

        <table v-if="dashboard.salesByService.length" class="gks-table">
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
      </DsCard>

      <!-- Санхүү -->
      <DsCard v-if="canSeeFinance" title="Санхүү" eyebrow="7–11">
        <div class="gks-reports__tiles">
          <div class="gks-tile">
            <span class="gks-tile__label">Нийт орлого</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.totalRevenue) }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Урьдчилгаа</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.prepaymentTotal) }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Үлдэгдэл</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.balanceTotal) }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Авлага</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.receivable) }}</span>
          </div>
          <div class="gks-tile gks-tile--warn">
            <span class="gks-tile__label">Хугацаа хэтэрсэн авлага</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.overdueReceivable) }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Буцаалт</span>
            <span class="gks-tile__value gks-tnum">{{ mnt(dashboard.refunded) }}</span>
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
        <div class="gks-reports__tiles">
          <div class="gks-tile">
            <span class="gks-tile__label">Материал бүрдүүлж байгаа</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.collectingDocuments }}</span>
          </div>
          <div class="gks-tile" :class="{ 'gks-tile--warn': dashboard.overdueDocuments > 0 }">
            <span class="gks-tile__label">Хугацаа хэтэрсэн материал</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.overdueDocuments }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Сургуульд мэдүүлсэн</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.submittedToUniversity }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Тэнцсэн</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.admitted }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Татгалзсан</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.rejected }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Урилга авсан</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.invited }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Виз гарсан</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.visaApproved }}</span>
          </div>
          <div class="gks-tile">
            <span class="gks-tile__label">Солонгос руу явсан</span>
            <span class="gks-tile__value gks-tnum">{{ dashboard.departed }}</span>
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
        <div v-else class="gks-table-wrap">
          <table class="gks-table">
            <thead>
              <tr>
                <th scope="col">Ажилтан</th>
                <th scope="col">Эрх</th>
                <th scope="col" class="gks-table__num">Сэжим</th>
                <th scope="col" class="gks-table__num">Гэрээ</th>
                <th scope="col" class="gks-table__num">Хөрвөлт</th>
                <th scope="col" class="gks-table__num">Хэрэг</th>
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
.gks-reports { display: flex; flex-direction: column; gap: var(--sp-5); }

.gks-reports__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}
.gks-reports__title { font-size: var(--fs-h3); font-weight: var(--fw-bold); margin: var(--sp-1) 0 var(--sp-1); }
.gks-reports__note { font-size: var(--fs-micro); color: var(--text-subtle); display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-reports__error { color: var(--danger-600, #b00020); font-size: var(--fs-small); }
.gks-reports__loading,
.gks-reports__empty { color: var(--text-subtle); font-size: var(--fs-small); }

.gks-reports__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--sp-3);
}

.gks-tile {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-md);
  background: var(--surface-page);
}
.gks-tile--warn { border-color: color-mix(in oklab, var(--accent-strong, #c8102e) 40%, var(--line-hairline)); }
.gks-tile__label { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-tile__value { font-size: var(--fs-h5, 18px); font-weight: var(--fw-bold); }

.gks-bars { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-bars__title { font-size: var(--fs-micro); color: var(--text-subtle); text-transform: uppercase; letter-spacing: var(--ls-caps); }
.gks-bars__row { display: grid; grid-template-columns: 132px 1fr auto; align-items: center; gap: var(--sp-3); font-size: var(--fs-small); }
.gks-bars__track { height: 8px; border-radius: var(--radius-pill); background: var(--line-hairline); overflow: hidden; }
.gks-bars__fill { display: block; height: 100%; background: var(--brand-600, #1f4e9c); }
.gks-bars__value { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-table-wrap { overflow-x: auto; }
.gks-table { width: 100%; border-collapse: collapse; margin-top: var(--sp-4); font-size: var(--fs-small); }
.gks-table__caption {
  text-align: left;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  padding-bottom: var(--sp-2);
}
.gks-table th,
.gks-table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); text-align: left; white-space: nowrap; }
.gks-table th { font-size: var(--fs-micro); color: var(--text-subtle); font-weight: var(--fw-semibold); }
.gks-table__num { text-align: right; }
.gks-table__num--warn { color: var(--danger-600, #b00020); font-weight: var(--fw-semibold); }
</style>
