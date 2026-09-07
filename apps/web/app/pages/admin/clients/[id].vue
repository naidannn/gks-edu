<script setup lang="ts">
import type { ClientStatus } from '@gks/shared';
import { clientPayload, emptyClientForm, fillFromClient, fillChoicesFromCase, validateClientForm } from '~/utils/client-form';

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
/**
 * What the save did to the contracts (1C-30). A corrected register number is
 * rewritten into every contract nobody has signed yet; a signed one is left
 * alone, and the office has to say so out loud rather than assume the paper
 * followed the record.
 */
const contractNotice = ref<{ text: string; warn: boolean } | null>(null);

/**
 * Registration linked the client to the login they had already opened on the
 * site, rather than making a second one (1B-20). Staff need to know once: no
 * invitation went out, because the client can already sign in.
 */
const accountNotice = ref(route.query.linked === '1');

function dismissAccountNotice() {
  accountNotice.value = false;
  router.replace({ query: { ...route.query, linked: undefined } });
}

const { universities, loading: universitiesLoading, load: loadUniversities } = useUniversityCatalogue();

const STATUS_OPTIONS = selectOptions(CLIENT_STATUS_LABELS);

/** One line about what happened to the contracts, or nothing to say. */
function contractSyncNotice(sync?: { refreshed: number; locked: number }): { text: string; warn: boolean } | null {
  if (!sync) return null;
  const refreshed = sync.refreshed > 0 ? `Гарын үсэг зураагүй ${sync.refreshed} гэрээ шинэ мэдээллээр шинэчлэгдлээ.` : '';
  const locked =
    sync.locked > 0
      ? `Гарын үсэг зурагдсан ${sync.locked} гэрээнд засвар тусахгүй — шинэ гэрээгээр баталгаажуулна уу.`
      : '';
  const text = [refreshed, locked].filter(Boolean).join(' ');
  return text ? { text, warn: sync.locked > 0 } : null;
}

async function startEditing() {
  if (!client.value) return;
  fillFromClient(form, client.value);
  // The client row remembers only the first preference; the whole school list
  // belongs to the live case, which is what the edit form actually writes back.
  fillChoicesFromCase(form, activeCase.value?.universityChoices ?? []);
  status.value = client.value.status;
  saveError.value = null;
  contractNotice.value = null;
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
    const saved = await api.patch<{ contractSync?: { refreshed: number; locked: number } }>(
      `/clients/${id.value}`,
      { ...clientPayload(form), status: status.value },
    );
    contractNotice.value = contractSyncNotice(saved?.contractSync);
    editing.value = false;
    await workspace.refresh();
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Хадгалахад алдаа гарлаа.');
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
  <div class="gks-page">
    <DsCard v-if="error" accent><p>{{ error }}</p></DsCard>
    <div v-else-if="pending && !client" class="gks-skeleton__row gks-skeleton--page" />

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

        <div class="gks-form-actions">
          <DsButton variant="secondary" @click="editing = false">Болих</DsButton>
          <DsButton type="submit" variant="accent" icon-left="check" :loading="saving">Хадгалах</DsButton>
        </div>
      </form>

      <template v-else>
        <DsCard v-if="accountNotice">
          <p class="gks-ws__notice">
            Энэ хүн сайт дээр өмнө нь бүртгүүлсэн байсан тул үйлчилгээг нь тухайн бүртгэл дээр нь холболоо —
            өөрийн кабинетаараа шууд харна. Урилга илгээгээгүй.
            <button type="button" class="gks-ws__notice-close" @click="dismissAccountNotice">Ойлголоо</button>
          </p>
        </DsCard>

        <DsCard v-if="contractNotice" :accent="contractNotice.warn">
          <p class="gks-ws__notice" :class="{ 'gks-ws__notice--warn': contractNotice.warn }">
            {{ contractNotice.text }}
          </p>
        </DsCard>

        <nav class="gks-tabs" aria-label="Үйлчлүүлэгчийн хэсгүүд">
          <button
            v-for="entry in TABS"
            :key="entry.key"
            type="button"
            class="gks-tab"
            :class="{ 'gks-tab--active': tab === entry.key }"
            :aria-current="tab === entry.key ? 'page' : undefined"
            @click="openTab(entry.key)"
          >
            <DsIcon :name="entry.icon" :size="16" />
            <span>{{ entry.label }}</span>
            <span v-if="entry.key === 'overview' && alerts.length" class="gks-tab__count gks-tnum">
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
          @changed="workspace.refresh()"
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
          <p class="gks-ws__empty">Үйлчилгээ эхлээгүй тул энэ хэсэг хоосон байна.</p>
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
.gks-ws__form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 1100px; }
.gks-ws__status-field { margin-top: var(--sp-4); max-width: 320px; }
.gks-ws__error { color: var(--danger-fg); }
.gks-ws__notice { font-size: var(--fs-body-sm); }
.gks-ws__notice--warn { color: var(--danger-fg); }
.gks-ws__notice-close {
  margin-left: var(--sp-2);
  border: 0;
  background: none;
  padding: 0;
  color: var(--text-accent);
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
}
.gks-ws__empty { font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>

