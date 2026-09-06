<script setup lang="ts">
import type { LeadListItem, LeadStage } from '@gks/shared';
import { ApiError } from '~/utils/api-error';
import { useAuthStore } from '~/stores/auth';

/**
 * 1B-06 — the sales board. One column per `LeadStage`, cards dragged between
 * them.
 *
 * A drop calls `POST /leads/:id/transitions`, which is the same guarded move
 * the detail page makes: the allowed-transition graph lives on the server
 * (1B-02), so an illegal drag is refused and the card snaps back rather than
 * the board inventing a shortcut through the funnel.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Борлуулалтын самбар · CRM' });

/** `WON` and `LOST` close the funnel; they are shown, but at the end. */
const COLUMNS: LeadStage[] = ['NEW', 'CONTACTED', 'CONSULTED', 'PROPOSAL_SENT', 'CONTRACT_PENDING', 'WON', 'LOST'];

const api = useApi();
const auth = useAuthStore();

const leads = ref<LeadListItem[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const mineOnly = ref(false);
const dragging = ref<string | null>(null);
const dropTarget = ref<LeadStage | null>(null);
const truncated = ref(false);

/**
 * The board is a whole-funnel view, but `/leads` caps a page at 100, so it is
 * assembled from pages of 100 the way the school catalogue is. `WON` and
 * `LOST` accumulate forever, so the fetch stops at `MAX_PAGES`; sorting by
 * `updatedAt` desc means what falls off the end is the stalest, and the board
 * says so rather than quietly showing a short column.
 */
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

type LeadPage = { items: LeadListItem[]; meta: { totalPages: number } };

async function load() {
  pending.value = true;
  errorMsg.value = null;
  truncated.value = false;
  try {
    const query = { limit: PAGE_SIZE, sort: 'updatedAt', order: 'desc' };
    // The list endpoint already excludes merged rows.
    const first = await api.get<LeadPage>('/leads', { query: { ...query, page: 1 } });
    const pages = Math.min(first.meta.totalPages, MAX_PAGES);
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
        api.get<LeadPage>('/leads', { query: { ...query, page: index + 2 } })),
    );
    leads.value = [first, ...rest].flatMap((page) => page.items);
    truncated.value = first.meta.totalPages > MAX_PAGES;
  } catch (error) {
    // The message stays Mongolian, but the detail is logged: class-validator
    // replies in English, so a rejected query must not be echoed into the UI
    // the way a domain error from the service can be.
    console.error('[board] /leads', error instanceof ApiError ? `${error.status} ${error.message}` : error);
    errorMsg.value = 'Самбарыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const visible = computed(() =>
  mineOnly.value ? leads.value.filter((lead) => lead.assignedToId === auth.user?.id) : leads.value,
);

function column(stage: LeadStage): LeadListItem[] {
  return visible.value.filter((lead) => lead.stage === stage);
}

function onDragStart(lead: LeadListItem) {
  dragging.value = lead.id;
}

function onDragEnd() {
  dragging.value = null;
  dropTarget.value = null;
}

async function onDrop(stage: LeadStage) {
  const id = dragging.value;
  dropTarget.value = null;
  dragging.value = null;
  if (!id) return;

  const lead = leads.value.find((row) => row.id === id);
  if (!lead || lead.stage === stage) return;

  const previous = lead.stage;
  // Optimistic: the card follows the cursor, and reverts if the server
  // refuses the transition.
  lead.stage = stage;
  try {
    await api.post(`/leads/${id}/transitions`, { stage });
  } catch (error) {
    lead.stage = previous;
    errorMsg.value = apiErrorMessage(error, 'Үе шатыг өөрчилж чадсангүй');
  }
}

function isOverdue(lead: LeadListItem): boolean {
  return Boolean(lead.nextContactAt && new Date(lead.nextContactAt) <= new Date());
}
</script>

<template>
  <div class="gks-page gks-board">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Борлуулалтын самбар</h1>
      </div>
      <div class="gks-page__actions">
        <DsTag :selected="!mineOnly" clickable @click="mineOnly = false">Бүгд</DsTag>
        <DsTag :selected="mineOnly" clickable @click="mineOnly = true">Надад оноогдсон</DsTag>
        <DsButton variant="secondary" size="sm" icon-left="list" @click="navigateTo('/admin/consultations')">
          Жагсаалт
        </DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-board__error">{{ errorMsg }}</p>
    <p v-if="pending" class="gks-board__note">Уншиж байна…</p>
    <p v-else-if="truncated" class="gks-board__note">
      Сүүлд шинэчлэгдсэн {{ PAGE_SIZE * MAX_PAGES }} сэжмийг харуулж байна. Бүгдийг жагсаалтаас харна уу.
    </p>

    <div v-else class="gks-board__columns">
      <section
        v-for="stage in COLUMNS"
        :key="stage"
        class="gks-board__col"
        :class="{ 'gks-board__col--over': dropTarget === stage }"
        @dragover.prevent="dropTarget = stage"
        @dragleave="dropTarget === stage && (dropTarget = null)"
        @drop.prevent="onDrop(stage)"
      >
        <header class="gks-board__col-head">
          <span class="gks-board__col-title">{{ LEAD_STAGE_LABELS[stage] }}</span>
          <span class="gks-board__col-count gks-tnum">{{ column(stage).length }}</span>
        </header>

        <p v-if="!column(stage).length" class="gks-board__col-empty">—</p>

        <article
          v-for="lead in column(stage)"
          :key="lead.id"
          class="gks-board__card"
          :class="{ 'gks-board__card--dragging': dragging === lead.id }"
          draggable="true"
          @dragstart="onDragStart(lead)"
          @dragend="onDragEnd"
          @click="navigateTo(`/admin/consultations/${lead.id}`)"
        >
          <p class="gks-board__card-name">{{ lead.lastName }} {{ lead.firstName }}</p>
          <p class="gks-board__card-meta gks-tnum">{{ lead.phone }}</p>
          <div class="gks-board__card-foot">
            <span class="gks-board__card-owner">{{ lead.assignedTo?.name ?? 'Хариуцагчгүй' }}</span>
            <span
              v-if="lead.nextContactAt"
              class="gks-board__card-due gks-tnum"
              :class="{ 'gks-board__card-due--overdue': isOverdue(lead) }"
            >
              {{ formatDayMonth(lead.nextContactAt) }}
            </span>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* The pipeline is the page: it takes the height the shell leaves it, and each
   column scrolls on its own rather than the whole board scrolling as one. */
.gks-board { flex: 1; min-height: 0; }
.gks-board__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-board__note { color: var(--text-subtle); font-size: var(--fs-body-sm); }

.gks-board__columns {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(240px, 1fr);
  gap: var(--sp-3);
  overflow-x: auto;
  padding-bottom: var(--sp-3);
  align-items: start;
}

.gks-board__col {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-sunken);
  min-height: 220px;
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.gks-board__col--over { border-color: var(--brand-600); background: var(--surface-selected); }

/* Sticky so you can still see which column you are dropping into halfway
   down a long one. */
.gks-board__col-head {
  position: sticky;
  top: calc(var(--sp-3) * -1);
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: calc(var(--sp-3) * -1) calc(var(--sp-3) * -1) 0;
  padding: var(--sp-3);
  background: var(--surface-sunken);
}
.gks-board__col-title { font-size: var(--fs-micro); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
.gks-board__col-count { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-board__col-empty { color: var(--text-subtle); font-size: var(--fs-micro); text-align: center; padding: var(--sp-4) 0; }

.gks-board__card {
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  cursor: grab;
}
.gks-board__card:active { cursor: grabbing; }
.gks-board__card--dragging { opacity: 0.4; }
.gks-board__card-name { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-board__card-meta { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-board__card-foot { display: flex; justify-content: space-between; gap: var(--sp-2); margin-top: var(--sp-2); font-size: 11px; color: var(--text-subtle); }
.gks-board__card-due--overdue { color: var(--danger-fg); font-weight: var(--fw-semibold); }
</style>
