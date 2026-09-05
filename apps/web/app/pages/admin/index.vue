<script setup lang="ts">
import type { ClientStats, LeadStats, PaymentStats, ReviewQueueItem } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * The CRM dashboard, rebuilt around one question (1G-17): "өнөөдөр юунд
 * анхаарах вэ?".
 *
 * Every tile is a queue with a number on it, and every tile opens the filtered
 * list that clears it — never a statistic with nowhere to go. It composes the
 * counters the modules already publish (`/leads/stats`, `/clients/stats`,
 * `/payments/stats`, the document reminder feed); nothing new is computed here.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const api = useApi();
const auth = useAuthStore();

const leads = ref<LeadStats | null>(null);
const clients = ref<ClientStats | null>(null);
const payments = ref<PaymentStats | null>(null);
const dueDocuments = ref<ReviewQueueItem[]>([]);
const pending = ref(true);
const error = ref(false);

/**
 * Tokens only exist client-side, so `auth.isDocStaff` is false during SSR and
 * true after hydration. Any copy that depends on the role waits for the client
 * rather than rendering one sentence on the server and another in the browser.
 */
const roleKnown = ref(false);
onMounted(() => { roleKnown.value = true; });

async function load() {
  pending.value = true;
  error.value = false;
  try {
    // The document feed is document-officer scoped; a consultant without that
    // role still gets the rest of the board rather than an empty page.
    const [leadStats, clientStats, paymentStats, reminders] = await Promise.all([
      api.get<LeadStats>('/leads/stats'),
      api.get<ClientStats>('/clients/stats'),
      api.get<PaymentStats>('/payments/stats'),
      auth.isDocStaff
        ? api.get<ReviewQueueItem[]>('/case-documents/reminders').catch(() => [])
        : Promise.resolve([]),
    ]);
    leads.value = leadStats;
    clients.value = clientStats;
    payments.value = paymentStats;
    dueDocuments.value = reminders;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const pendingPaymentTotal = computed(() =>
  (payments.value?.pendingByKind ?? []).reduce((sum, row) => sum + Number(row.totalMnt), 0),
);
const pendingPaymentCount = computed(() =>
  (payments.value?.pendingByKind ?? []).reduce((sum, row) => sum + row.count, 0),
);

const overdueDocuments = computed(
  () => dueDocuments.value.filter((row) => row.dueAt && new Date(row.dueAt) < new Date()).length,
);

/** The board: what is waiting, how much of it, and where it is cleared. */
const queues = computed(() => [
  {
    key: 'new-requests',
    label: 'Шинэ зөвлөгөө хүсэлт',
    value: leads.value?.byStage.NEW ?? 0,
    hint: 'Хараахан холбогдоогүй',
    icon: 'message-square',
    urgent: (leads.value?.byStage.NEW ?? 0) > 0,
    to: '/admin/consultations?stage=NEW',
  },
  {
    key: 'unassigned',
    label: 'Хариуцагчгүй хүсэлт',
    value: leads.value?.unassigned ?? 0,
    hint: 'Хэн ч аваагүй байна',
    icon: 'user-x',
    urgent: (leads.value?.unassigned ?? 0) > 0,
    to: '/admin/consultations',
  },
  {
    key: 'missing-docs',
    label: 'Материал дутуу',
    value: overdueDocuments.value,
    hint: 'Хугацаа хэтэрсэн бичиг баримт',
    icon: 'file-warning',
    urgent: overdueDocuments.value > 0,
    to: '/admin/clients?attention=MISSING_DOCS',
  },
  {
    key: 'payments',
    label: 'Төлбөр хүлээгдэж буй',
    value: pendingPaymentCount.value,
    hint: formatMntAmount(pendingPaymentTotal.value) ?? '—',
    icon: 'credit-card',
    urgent: (payments.value?.overdueCount ?? 0) > 0,
    to: '/admin/clients?attention=PENDING_PAYMENT',
  },
  {
    key: 'unassigned-clients',
    label: 'Хариуцагчгүй үйлчлүүлэгч',
    value: clients.value?.unassigned ?? 0,
    hint: 'Зөвлөх томилох',
    icon: 'users',
    urgent: false,
    to: '/admin/clients',
  },
]);

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' });
}
function isLate(value: string | null): boolean {
  return Boolean(value) && new Date(value!) < new Date();
}

/**
 * Filled on the client: the server's clock is UTC and the office's is not.
 * Written out by hand rather than through `toLocaleDateString('mn-MN')` —
 * Chrome has no long-form Mongolian date data and silently answers in English.
 */
const WEEKDAYS_MN = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
const today = ref('');
onMounted(() => {
  const now = new Date();
  today.value = `${now.getFullYear()} оны ${now.getMonth() + 1} сарын ${now.getDate()}`
    + `, ${WEEKDAYS_MN[now.getDay()]} гараг`;
});

useHead({ title: 'Хяналтын самбар · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Өнөөдөр юунд анхаарах вэ?</h1>
      </div>
      <p class="gks-dash__today gks-tnum">{{ today }}</p>
    </header>

    <DsCard v-if="error" accent><p>Хяналтын самбарын мэдээллийг ачаалж чадсангүй.</p></DsCard>

    <template v-else>
      <!-- Each tile is a queue: a count, and the filtered list that clears it. -->
      <div class="gks-dash__queues">
        <button
          v-for="queue in queues"
          :key="queue.key"
          type="button"
          class="gks-queue"
          :class="{ 'gks-queue--urgent': queue.urgent && queue.value > 0 }"
          @click="navigateTo(queue.to)"
        >
          <span class="gks-queue__icon"><DsIcon :name="queue.icon" :size="18" /></span>
          <span class="gks-queue__value gks-tnum">
            <template v-if="pending && !leads">—</template>
            <template v-else>{{ queue.value }}</template>
          </span>
          <span class="gks-queue__label">{{ queue.label }}</span>
          <span class="gks-queue__hint">{{ queue.hint }}</span>
        </button>
      </div>

      <div class="gks-dash__grid">
        <DsCard title="Сүүлд ирсэн хүсэлт">
          <template #action>
            <NuxtLink to="/admin/consultations" class="gks-dash__link">Бүгдийг харах →</NuxtLink>
          </template>

          <div v-if="pending && !leads" class="gks-dash__skeleton" />
          <ul v-else-if="leads?.recent.length" class="gks-dash__rows">
            <li v-for="lead in leads.recent" :key="lead.id">
              <NuxtLink :to="`/admin/consultations/${lead.id}`" class="gks-dash__row">
                <span class="gks-dash__row-name">{{ lead.lastName }} {{ lead.firstName }}</span>
                <span class="gks-dash__row-sub gks-tnum">{{ lead.phone }}</span>
                <DsBadge :tone="LEAD_STAGE_TONE[lead.stage]">{{ LEAD_STAGE_LABELS[lead.stage] }}</DsBadge>
                <span class="gks-dash__row-date gks-tnum">{{ formatDate(lead.createdAt) }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="gks-dash__empty">Шинэ хүсэлт алга байна.</p>
        </DsCard>

        <DsCard title="Хугацаа дөхсөн материал">
          <template #action>
            <NuxtLink to="/admin/documents" class="gks-dash__link">Шалгах дараалал →</NuxtLink>
          </template>

          <ul v-if="dueDocuments.length" class="gks-dash__rows">
            <li v-for="document in dueDocuments.slice(0, 8)" :key="document.id">
              <NuxtLink :to="`/admin/documents?caseId=${document.case.id}`" class="gks-dash__row">
                <span class="gks-dash__row-name">{{ document.template.nameMn }}</span>
                <span class="gks-dash__row-sub">{{ document.case.user.name ?? document.case.code }}</span>
                <DsBadge :tone="isLate(document.dueAt) ? 'danger' : 'warning'">
                  {{ isLate(document.dueAt) ? 'Хэтэрсэн' : 'Дөхсөн' }}
                </DsBadge>
                <span class="gks-dash__row-date gks-tnum">{{ formatDate(document.dueAt) }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="gks-dash__empty">
            <template v-if="!roleKnown">&nbsp;</template>
            <template v-else>
              {{ auth.isDocStaff ? 'Хугацаа дөхсөн материал алга байна.' : 'Энэ хэсэг баримт хариуцагчид харагдана.' }}
            </template>
          </p>
        </DsCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gks-dash__today { font-size: var(--fs-body-sm); color: var(--text-subtle); }

/* The queue strip stretches to whatever the monitor gives it — five tiles on a
   laptop, five wider ones on a 27". No fixed column count to re-tune. */
.gks-dash__queues { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3); }
.gks-queue {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  text-align: left;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-queue:hover { border-color: var(--brand-400); }
.gks-queue--urgent { border-top: var(--border-rail) solid var(--red-700); }
.gks-queue__icon { color: var(--text-subtle); }
.gks-queue__value { font-size: var(--fs-h2); font-weight: var(--fw-bold); line-height: 1.1; color: var(--text-strong); }
.gks-queue__label { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-queue__hint { font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-dash__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: var(--sp-4); align-items: start; }
.gks-dash__link { font-size: var(--fs-caption); color: var(--brand-700); text-decoration: none; }

.gks-dash__rows { display: flex; flex-direction: column; }
.gks-dash__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  text-decoration: none;
}
.gks-dash__rows li:last-child .gks-dash__row { border-bottom: 0; }
.gks-dash__row:hover { background: var(--surface-hover); }
.gks-dash__row-name { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gks-dash__row-sub { font-size: var(--fs-caption); color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gks-dash__row-date { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-dash__empty { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-dash__skeleton { height: 180px; background: linear-gradient(var(--n-050), var(--n-100)); }

@media (max-width: 520px) {
  .gks-dash__queues { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gks-dash__grid { grid-template-columns: 1fr; }
}
</style>
