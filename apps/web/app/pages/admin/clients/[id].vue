<script setup lang="ts">
import type { ClientStatus } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import { clientPayload, emptyClientForm, fillFromClient, validateClientForm } from '~/utils/client-form';

/**
 * The client workspace (1G-17) — the one screen an admin runs a student from.
 *
 * It replaces the walk between `/admin/clients/:id`, `/admin/cases/:id`,
 * `/admin/documents?caseId=`, `/admin/applications/:caseId` and the visa desk:
 * five tabs over one `/clients/:id/workspace` payload. The cross-client queues
 * still exist under "Үйл ажиллагаа"; this is simply the way in for one person.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Tab = 'overview' | 'process' | 'documents' | 'payments' | 'activity';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Тойм', icon: 'layout-dashboard' },
  { key: 'process', label: 'Процесс', icon: 'git-branch' },
  { key: 'documents', label: 'Бичиг баримт', icon: 'file-check-2' },
  { key: 'payments', label: 'Төлбөр', icon: 'credit-card' },
  { key: 'activity', label: 'Түүх', icon: 'history' },
];

const route = useRoute();
const router = useRouter();
const api = useApi();
const id = computed(() => String(route.params.id));

const workspace = useClientWorkspace(id);
const { client, cases, activeCase, alerts, activity, selectedCaseId, pending, error } = workspace;

/** The tab lives in the URL, so a link into "documents" survives a reload. */
const tab = computed<Tab>(() => {
  const value = route.query.tab;
  const known = TABS.find((entry) => entry.key === value);
  return known?.key ?? 'overview';
});

function openTab(next: Tab) {
  router.replace({ query: { ...route.query, ...(next === 'overview' ? { tab: undefined } : { tab: next }) } });
}

onMounted(() => workspace.load());
watch(id, () => workspace.load());

// The merged timeline is only worth fetching once someone asks for it.
watch(tab, (value) => { if (value === 'activity') workspace.loadActivity(); }, { immediate: true });

// ── Editing the client record ──────────────────────────────────────────────
const editing = ref(false);
const form = reactive(emptyClientForm());
const errors = reactive<Record<string, string>>({});
const status = ref<ClientStatus>('ACTIVE');
const saving = ref(false);
const saveError = ref<string | null>(null);

const { universities, loading: universitiesLoading, load: loadUniversities } = useUniversityCatalogue();

const STATUS_OPTIONS = (Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][])
  .map(([value, label]) => ({ value, label }));

async function startEditing() {
  if (!client.value) return;
  fillFromClient(form, client.value);
  status.value = client.value.status;
  saveError.value = null;
  editing.value = true;
  if (!universities.value.length) await loadUniversities();
}

async function save() {
  saveError.value = null;
  if (!validateClientForm(form, errors)) {
    saveError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }
  saving.value = true;
  try {
    await api.patch(`/clients/${id.value}`, { ...clientPayload(form), status: status.value });
    editing.value = false;
    await workspace.refresh();
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : 'Хадгалахад алдаа гарлаа.';
  } finally {
    saving.value = false;
  }
}

useHead({
  title: computed(() =>
    client.value ? `${client.value.lastName} ${client.value.firstName} · CRM` : 'Үйлчлүүлэгч · CRM',
  ),
});
</script>

<template>
  <div class="gks-ws">
    <DsCard v-if="error" accent><p>{{ error }}</p></DsCard>
    <div v-else-if="pending && !client" class="gks-ws__skeleton" />

    <template v-else-if="client">
      <CrmClientHeader
        :client="client"
        :active-case="activeCase"
        :cases="cases"
        @select-case="selectedCaseId = $event"
        @edit="startEditing"
      />

      <!-- Edit takes over the page rather than opening a modal (UX: no modals). -->
      <form v-if="editing" class="gks-ws__form" @submit.prevent="save">
        <CrmClientFormFields
          v-model="form"
          :errors="errors"
          :universities="universities"
          :loading-universities="universitiesLoading"
        >
          <template #service-extra>
            <div class="gks-ws__status-field">
              <DsSelect v-model="status" label="Үйлчлүүлэгчийн төлөв" :options="STATUS_OPTIONS" />
            </div>
          </template>
        </CrmClientFormFields>

        <DsCard v-if="saveError" accent><p class="gks-ws__error">{{ saveError }}</p></DsCard>

        <div class="gks-ws__form-actions">
          <DsButton variant="secondary" @click="editing = false">Болих</DsButton>
          <DsButton type="submit" variant="accent" icon-left="check" :loading="saving">Хадгалах</DsButton>
        </div>
      </form>

      <template v-else>
        <nav class="gks-ws__tabs" aria-label="Үйлчлүүлэгчийн хэсгүүд">
          <button
            v-for="entry in TABS"
            :key="entry.key"
            type="button"
            class="gks-ws__tab"
            :class="{ 'gks-ws__tab--active': tab === entry.key }"
            :aria-current="tab === entry.key ? 'page' : undefined"
            @click="openTab(entry.key)"
          >
            <DsIcon :name="entry.icon" :size="16" />
            <span>{{ entry.label }}</span>
            <span v-if="entry.key === 'overview' && alerts.length" class="gks-ws__tab-count gks-tnum">
              {{ alerts.length }}
            </span>
          </button>
        </nav>

        <CrmClientOverview
          v-if="tab === 'overview'"
          :client="client"
          :workspace-case="activeCase"
          :alerts="alerts"
          @open="openTab"
        />

        <template v-else-if="activeCase">
          <CrmClientProcessTimeline
            v-if="tab === 'process'"
            :workspace-case="activeCase"
            @changed="workspace.refresh()"
          />
          <CrmClientDocuments
            v-else-if="tab === 'documents'"
            :workspace-case="activeCase"
            @changed="workspace.refresh()"
          />
          <CrmClientPayments
            v-else-if="tab === 'payments'"
            :workspace-case="activeCase"
            @changed="workspace.refresh()"
          />
        </template>

        <DsCard v-else-if="tab !== 'activity'" padding="var(--sp-8)">
          <p class="gks-ws__empty">Хэрэг нээгдээгүй тул энэ хэсэг хоосон байна.</p>
        </DsCard>

        <CrmClientActivity
          v-if="tab === 'activity'"
          :client="client"
          :entries="activity"
          @changed="workspace.loadActivity(true)"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-ws { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-ws__skeleton { height: 320px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }

.gks-ws__tabs {
  display: flex;
  gap: var(--sp-1);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  overflow-x: auto;
}
.gks-ws__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-ws__tab:hover { color: var(--text-strong); }
.gks-ws__tab--active { color: var(--brand-700); border-bottom-color: var(--brand-600); font-weight: var(--fw-semibold); }
.gks-ws__tab-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--danger-bg);
  color: var(--danger-fg);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
}

.gks-ws__form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 960px; }
.gks-ws__status-field { margin-top: var(--sp-4); max-width: 320px; }
.gks-ws__form-actions { display: flex; justify-content: flex-end; gap: var(--sp-3); }
.gks-ws__error { color: var(--danger-fg); }
.gks-ws__empty { font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>
