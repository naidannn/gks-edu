<script setup lang="ts">
import type { CaseStage, ClientCaseSummary, ClientDetail, ClientStatus, ContractStatus } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import { clientPayload, emptyClientForm, fillFromClient, validateClientForm } from '~/utils/client-form';

/** One client: identity, guardian, schooling and every case they run (1B-14). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const api = useApi();
const id = computed(() => String(route.params.id));

const client = ref<ClientDetail | null>(null);
const pending = ref(true);
const loadError = ref(false);

async function load() {
  pending.value = true;
  loadError.value = false;
  try {
    client.value = await api.get<ClientDetail>(`/clients/${id.value}`);
  } catch {
    loadError.value = true;
  } finally {
    pending.value = false;
  }
}
onMounted(load);

// ── Edit mode ──────────────────────────────────────────────────────────────
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
    client.value = await api.patch<ClientDetail>(`/clients/${id.value}`, {
      ...clientPayload(form),
      status: status.value,
    });
    editing.value = false;
  } catch (err) {
    saveError.value = err instanceof ApiError ? err.message : 'Хадгалахад алдаа гарлаа.';
  } finally {
    saving.value = false;
  }
}

// ── Presentation ───────────────────────────────────────────────────────────
function stageTone(s: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'COMPLETED' || s === 'DEPARTED') return 'success';
  if (s === 'CANCELLED' || s === 'REJECTED') return 'danger';
  if (s === 'ON_HOLD') return 'warning';
  if (s === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}
function contractTone(s: ContractStatus): 'neutral' | 'info' | 'success' | 'danger' {
  if (s === 'ACTIVE' || s === 'COMPLETED') return 'success';
  if (s === 'TERMINATED') return 'danger';
  if (s === 'SIGNED' || s === 'SENT') return 'info';
  return 'neutral';
}
function statusTone(s: ClientStatus): 'success' | 'neutral' {
  return s === 'ACTIVE' ? 'success' : 'neutral';
}
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function caseContractDate(c: ClientCaseSummary): string {
  return c.contract ? formatDate(c.contract.signedAt ?? c.contract.createdAt) : '—';
}
const guardianName = computed(() => {
  const c = client.value;
  if (!c?.guardianLastName && !c?.guardianFirstName) return null;
  return `${c?.guardianLastName ?? ''} ${c?.guardianFirstName ?? ''}`.trim();
});

useHead({ title: computed(() => (client.value ? `${client.value.lastName} ${client.value.firstName} · CRM` : 'Хэрэглэгч · CRM')) });
</script>

<template>
  <div class="gks-detail">
    <DsCard v-if="loadError" accent><p>Хэрэглэгчийн мэдээллийг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !client" class="gks-detail__skeleton" />

    <template v-else-if="client">
      <header class="gks-detail__head">
        <div>
          <NuxtLink to="/admin/clients" class="gks-detail__back">
            <DsIcon name="arrow-left" :size="16" /> Хэрэглэгчийн жагсаалт
          </NuxtLink>
          <h1 class="gks-detail__title">{{ client.lastName }} {{ client.firstName }}</h1>
          <div class="gks-detail__badges">
            <span class="gks-detail__code gks-tnum">{{ client.code }}</span>
            <DsBadge :tone="statusTone(client.status)">{{ CLIENT_STATUS_LABELS[client.status] }}</DsBadge>
            <DsBadge v-if="client.isMinor" tone="warning" icon="triangle-alert">18 нас хүрээгүй</DsBadge>
          </div>
        </div>
        <div class="gks-detail__actions">
          <DsButton v-if="!editing" variant="secondary" icon-left="pencil" @click="startEditing">Засах</DsButton>
          <DsButton
            v-if="client.activeCase"
            variant="accent"
            icon-right="arrow-right"
            @click="navigateTo(`/admin/cases/${client.activeCase.id}`)"
          >
            Хэрэг рүү очих
          </DsButton>
        </div>
      </header>

      <!-- ── Edit mode ───────────────────────────────────────────────────── -->
      <form v-if="editing" class="gks-detail__form" @submit.prevent="save">
        <CrmClientFormFields
          v-model="form"
          :errors="errors"
          :universities="universities"
          :loading-universities="universitiesLoading"
        >
          <template #service-extra>
            <div class="gks-detail__status-field">
              <DsSelect v-model="status" label="Хэрэглэгчийн төлөв" :options="STATUS_OPTIONS" />
            </div>
          </template>
        </CrmClientFormFields>

        <DsCard v-if="saveError" accent><p class="gks-detail__error">{{ saveError }}</p></DsCard>

        <div class="gks-detail__form-actions">
          <DsButton variant="secondary" @click="editing = false">Болих</DsButton>
          <DsButton type="submit" variant="accent" icon-left="check" :loading="saving">Хадгалах</DsButton>
        </div>
      </form>

      <!-- ── Read mode ───────────────────────────────────────────────────── -->
      <template v-else>
        <div class="gks-detail__cols">
          <div class="gks-detail__col">
            <DsCard title="Зуучлалын хэрэг" eyebrow="Үе шат">
              <p v-if="!client.cases.length" class="gks-detail__empty">
                Хэрэг нээгээгүй байна — гэрээ байгуулахын тулд эхлээд хэрэг нээнэ.
              </p>
              <div v-else class="gks-detail__table-wrap">
                <table class="gks-table">
                  <thead>
                    <tr><th>Код</th><th>Үйлчилгээ</th><th>Сургууль</th><th>Үе шат</th><th>Гэрээ</th><th>Гэрээний огноо</th></tr>
                  </thead>
                  <tbody>
                    <tr v-for="c in client.cases" :key="c.id" class="gks-detail__row" @click="navigateTo(`/admin/cases/${c.id}`)">
                      <td class="gks-tnum">{{ c.code }}</td>
                      <td>{{ SERVICE_LABELS[c.serviceType] }}</td>
                      <td>{{ c.university?.nameMn ?? '—' }}</td>
                      <td><DsBadge :tone="stageTone(c.stage)">{{ CASE_STAGE_LABELS[c.stage] }}</DsBadge></td>
                      <td>
                        <DsBadge v-if="c.contract" :tone="contractTone(c.contract.status)">
                          {{ CONTRACT_STATUS_LABELS[c.contract.status] }}
                        </DsBadge>
                        <span v-else class="gks-detail__muted">—</span>
                      </td>
                      <td class="gks-tnum">{{ caseContractDate(c) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </DsCard>

            <DsCard title="Хувийн мэдээлэл">
              <dl class="gks-detail__dl">
                <div><dt>Регистрийн дугаар</dt><dd class="gks-tnum">{{ client.registerNumber }}</dd></div>
                <div><dt>Төрсөн огноо</dt><dd class="gks-tnum">{{ formatDate(client.birthDate) }}</dd></div>
                <div><dt>Хүйс</dt><dd>{{ client.gender ? GENDER_LABELS[client.gender] : '—' }}</dd></div>
                <div><dt>Утас</dt><dd class="gks-tnum">{{ client.phone }}</dd></div>
                <div><dt>Нэмэлт утас</dt><dd class="gks-tnum">{{ client.phoneAlt ?? '—' }}</dd></div>
                <div><dt>И-мэйл</dt><dd>{{ client.email ?? '—' }}</dd></div>
                <div class="gks-detail__dl-wide"><dt>Хаяг</dt><dd>{{ client.address ?? '—' }}</dd></div>
              </dl>
            </DsCard>

            <DsCard v-if="guardianName" title="Төлөөлөн гэрээ байгуулагч" :accent="client.isMinor">
              <dl class="gks-detail__dl">
                <div><dt>Овог нэр</dt><dd>{{ guardianName }}</dd></div>
                <div><dt>Регистрийн дугаар</dt><dd class="gks-tnum">{{ client.guardianRegisterNumber ?? '—' }}</dd></div>
                <div><dt>Утас</dt><dd class="gks-tnum">{{ client.guardianPhone ?? '—' }}</dd></div>
                <div><dt>Хамаарал</dt><dd>{{ client.guardianRelation ?? '—' }}</dd></div>
              </dl>
            </DsCard>

            <DsCard title="Боловсрол ба хэлний түвшин">
              <dl class="gks-detail__dl">
                <div>
                  <dt>Боловсролын түвшин</dt>
                  <dd>{{ client.educationLevel ? EDUCATION_LEVEL_LABELS[client.educationLevel] : '—' }}</dd>
                </div>
                <div><dt>Сургууль</dt><dd>{{ client.schoolName ?? '—' }}</dd></div>
                <div><dt>Голч</dt><dd class="gks-tnum">{{ client.gpa ?? '—' }}{{ client.gpaScale ? ` / ${client.gpaScale}` : '' }}</dd></div>
                <div><dt>Солонгос хэл</dt><dd>{{ client.koreanLevel ?? '—' }}</dd></div>
                <div><dt>Англи хэл</dt><dd>{{ client.englishLevel ?? '—' }}</dd></div>
                <div><dt>Паспорт</dt><dd class="gks-tnum">{{ client.passportNumber ?? '—' }}</dd></div>
                <div><dt>Паспортын хугацаа</dt><dd class="gks-tnum">{{ formatDate(client.passportExpiry) }}</dd></div>
              </dl>
            </DsCard>
          </div>

          <aside class="gks-detail__side">
            <DsCard title="Зуучлал">
              <dl class="gks-detail__dl gks-detail__dl--stack">
                <div><dt>Сонгосон үйлчилгээ</dt><dd>{{ SERVICE_LABELS[client.primaryServiceType] }}</dd></div>
                <div><dt>Зорилтот сургууль</dt><dd>{{ client.targetUniversity?.nameMn ?? '—' }}</dd></div>
                <div><dt>Мэргэжил</dt><dd>{{ client.targetMajor ?? '—' }}</dd></div>
                <div><dt>Гэрээний огноо</dt><dd class="gks-tnum">{{ formatDate(client.contractDate) }}</dd></div>
                <div><dt>Хариуцагч</dt><dd>{{ client.assignedConsultant?.name ?? client.assignedConsultant?.email ?? '—' }}</dd></div>
                <div><dt>Суваг</dt><dd>{{ LEAD_SOURCE_LABELS[client.source] }}</dd></div>
                <div><dt>Бүртгэсэн</dt><dd>{{ client.createdBy?.name ?? client.createdBy?.email ?? '—' }}</dd></div>
                <div><dt>Бүртгэсэн огноо</dt><dd class="gks-tnum">{{ formatDate(client.createdAt) }}</dd></div>
              </dl>
            </DsCard>

            <DsCard v-if="client.lead" title="Гарал үүсэл">
              <p class="gks-detail__origin">Энэ хэрэглэгч сэжмээс хөрвүүлэгдсэн.</p>
              <DsButton variant="secondary" size="sm" icon-left="user-search" @click="navigateTo(`/admin/leads/${client.lead.id}`)">
                Сэжмийн түүх харах
              </DsButton>
            </DsCard>

            <DsCard v-if="client.note" title="Тэмдэглэл">
              <p class="gks-detail__note">{{ client.note }}</p>
            </DsCard>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-detail { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-detail__skeleton { height: 320px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }

.gks-detail__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.gks-detail__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-subtle); text-decoration: none; }
.gks-detail__back:hover { color: var(--brand-600); }
.gks-detail__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-detail__badges { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-2); }
.gks-detail__code { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-detail__actions { display: flex; gap: var(--sp-3); }

.gks-detail__cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--sp-4); align-items: start; }
.gks-detail__col, .gks-detail__side { display: flex; flex-direction: column; gap: var(--sp-4); }

.gks-detail__dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-detail__dl--stack { grid-template-columns: 1fr; gap: var(--sp-3); }
.gks-detail__dl-wide { grid-column: 1 / -1; }
.gks-detail__dl dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-detail__dl dd { margin-top: 2px; font-size: var(--fs-body-sm); color: var(--text-strong); }

.gks-detail__table-wrap { overflow-x: auto; }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-detail__row { cursor: pointer; }
.gks-detail__row:hover { background: var(--surface-sunken); }
.gks-detail__muted { color: var(--text-subtle); }
.gks-detail__empty { color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-detail__origin { margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-detail__note { font-size: var(--fs-body-sm); white-space: pre-wrap; }

.gks-detail__form { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 960px; }
.gks-detail__status-field { margin-top: var(--sp-4); max-width: 320px; }
.gks-detail__form-actions { display: flex; justify-content: flex-end; gap: var(--sp-3); }
.gks-detail__error { color: var(--danger-fg); }

@media (max-width: 1100px) {
  .gks-detail__cols { grid-template-columns: 1fr; }
}
@media (max-width: 900px) {
  .gks-detail__dl { grid-template-columns: 1fr; }
}
</style>
