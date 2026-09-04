<script setup lang="ts">
import type {
  EducationLevel,
  LeadActivityItem,
  LeadActivityType,
  LeadDetail,
  LeadStage,
  ServiceType,
} from '@gks/shared';
import { LEAD_STAGE_TRANSITIONS } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import { useAuthStore } from '~/stores/auth';

/**
 * One consultation request: profile, stage moves, assignment, call history and
 * the conversion into a client (1B-02/03/04/07/10).
 *
 * Conversion is offered once, here, and lands on the new client's workspace —
 * the original request keeps its own timeline as sales history.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated<T> = { items: T[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const route = useRoute();
const auth = useAuthStore();
const api = useApi();
const id = computed(() => String(route.params.id));

const lead = ref<LeadDetail | null>(null);
const leadPending = ref(true);
const leadError = ref(false);

async function loadLead() {
  leadPending.value = true;
  leadError.value = false;
  try {
    lead.value = await api.get<LeadDetail>(`/leads/${id.value}`);
  } catch {
    leadError.value = true;
  } finally {
    leadPending.value = false;
  }
}
onMounted(loadLead);

// --- Activity timeline (1B-03) ---
const activities = ref<LeadActivityItem[]>([]);
const activitiesPage = ref(1);
const activitiesTotalPages = ref(1);
const activitiesPending = ref(true);

async function loadActivities(page = 1) {
  activitiesPending.value = true;
  try {
    const result = await api.get<Paginated<LeadActivityItem>>(`/leads/${id.value}/activities`, {
      query: { page, limit: 20 },
    });
    activities.value = page === 1 ? result.items : [...activities.value, ...result.items];
    activitiesPage.value = result.meta.page;
    activitiesTotalPages.value = result.meta.totalPages;
  } finally {
    activitiesPending.value = false;
  }
}
onMounted(() => loadActivities(1));
onMounted(loadDuplicates);

const ACTIVITY_TYPES: LeadActivityType[] = ['NOTE', 'CALL', 'MEETING', 'MESSAGE', 'EMAIL', 'CHAT'];
const newActivityType = ref<LeadActivityType>('NOTE');
const newActivityBody = ref('');
const activitySubmitting = ref(false);

async function submitActivity() {
  if (!newActivityBody.value.trim()) return;
  activitySubmitting.value = true;
  try {
    await api.post(`/leads/${id.value}/activities`, {
      type: newActivityType.value,
      body: newActivityBody.value.trim(),
    });
    newActivityBody.value = '';
    await loadActivities(1);
  } finally {
    activitySubmitting.value = false;
  }
}

// --- Stage transitions (1B-02) ---
const nextStages = computed<LeadStage[]>(() => (lead.value ? LEAD_STAGE_TRANSITIONS[lead.value.stage] : []));
const transitionTarget = ref<LeadStage | ''>('');
const lostReason = ref('');
const transitionPending = ref(false);
const transitionErrorMsg = ref<string | null>(null);

async function submitTransition() {
  if (!transitionTarget.value) return;
  transitionErrorMsg.value = null;
  transitionPending.value = true;
  try {
    await api.post(`/leads/${id.value}/transitions`, {
      stage: transitionTarget.value,
      ...(transitionTarget.value === 'LOST' ? { lostReason: lostReason.value } : {}),
    });
    transitionTarget.value = '';
    lostReason.value = '';
    await Promise.all([loadLead(), loadActivities(1)]);
  } catch (err) {
    transitionErrorMsg.value = (err as { message?: string }).message ?? 'Шилжилт амжилтгүй боллоо';
  } finally {
    transitionPending.value = false;
  }
}

// --- Assignment (1B-04) ---
const assignPending = ref(false);
async function assignToSelf() {
  if (!auth.user) return;
  assignPending.value = true;
  try {
    await api.patch(`/leads/${id.value}/assign`, { assignedToId: auth.user.id });
    await Promise.all([loadLead(), loadActivities(1)]);
  } finally {
    assignPending.value = false;
  }
}
async function unassign() {
  assignPending.value = true;
  try {
    await api.patch(`/leads/${id.value}/assign`, {});
    await Promise.all([loadLead(), loadActivities(1)]);
  } finally {
    assignPending.value = false;
  }
}
async function autoAssign() {
  assignPending.value = true;
  try {
    await api.post(`/leads/${id.value}/assign/auto`, {});
    await Promise.all([loadLead(), loadActivities(1)]);
  } finally {
    assignPending.value = false;
  }
}

// --- Quick edit: next contact date + win probability ---
const nextContactDraft = ref('');
const winProbabilityDraft = ref('');
watch(lead, (value) => {
  nextContactDraft.value = value?.nextContactAt ? value.nextContactAt.slice(0, 10) : '';
  winProbabilityDraft.value = value?.winProbability != null ? String(value.winProbability) : '';
}, { immediate: true });

const savingFacts = ref(false);
async function saveFacts() {
  savingFacts.value = true;
  try {
    const winProbability = winProbabilityDraft.value.trim() ? Number(winProbabilityDraft.value) : undefined;
    await api.patch(`/leads/${id.value}`, {
      ...(nextContactDraft.value ? { nextContactAt: new Date(nextContactDraft.value).toISOString() } : {}),
      ...(winProbability !== undefined && Number.isFinite(winProbability) ? { winProbability } : {}),
    });
    await loadLead();
  } finally {
    savingFacts.value = false;
  }
}

// --- Duplicate detection (1B-09) ---
interface DuplicateLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  stage: LeadStage;
  createdAt: string;
  matchedOn: string[];
}

const duplicates = ref<DuplicateLead[]>([]);
const merging = ref<string | null>(null);
const mergeError = ref<string | null>(null);

async function loadDuplicates() {
  try {
    duplicates.value = await api.get<DuplicateLead[]>(`/leads/${id.value}/duplicates`);
  } catch {
    duplicates.value = [];
  }
}

/**
 * Merging folds the *other* record into this one: this page is the survivor,
 * so the consultant merges from the record they decided to keep.
 */
async function mergeInto(source: DuplicateLead) {
  merging.value = source.id;
  mergeError.value = null;
  try {
    await api.post(`/leads/${id.value}/merge`, { sourceId: source.id });
    await Promise.all([loadLead(), loadActivities(1), loadDuplicates()]);
  } catch (error) {
    mergeError.value = error instanceof ApiError ? error.message : 'Нэгтгэж чадсангүй';
  } finally {
    merging.value = null;
  }
}

function matchLabel(matchedOn: string[]): string {
  const parts = matchedOn.map((field) => (field === 'phone' ? 'утас' : 'имэйл'));
  return parts.join(', ');
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

useHead({ title: () => (lead.value ? `${lead.value.lastName} ${lead.value.firstName}` : 'Зөвлөгөө хүсэлт') });
</script>

<template>
  <div class="gks-lead">
    <NuxtLink to="/admin/consultations" class="gks-lead__back"><DsIcon name="arrow-left" :size="16" /> Зөвлөгөө хүсэлт</NuxtLink>

    <DsCard v-if="leadError" accent><p>Хүсэлтийг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="leadPending && !lead" class="gks-lead__skeleton" />

    <template v-else-if="lead">
      <header class="gks-lead__head">
        <div>
          <h1 class="gks-lead__title">{{ lead.lastName }} {{ lead.firstName }}</h1>
          <div class="gks-lead__tags">
            <DsBadge :tone="LEAD_STAGE_TONE[lead.stage]">{{ LEAD_STAGE_LABELS[lead.stage] }}</DsBadge>
            <DsBadge tone="neutral">{{ LEAD_SOURCE_LABELS[lead.source] }}</DsBadge>
          </div>
        </div>
        <div class="gks-lead__head-side">
          <div class="gks-lead__contact">
            <a :href="`tel:${lead.phone}`" class="gks-lead__contact-link gks-tnum"><DsIcon name="phone" :size="16" /> {{ lead.phone }}</a>
            <a v-if="lead.email" :href="`mailto:${lead.email}`" class="gks-lead__contact-link"><DsIcon name="mail" :size="16" /> {{ lead.email }}</a>
          </div>
          <!-- Conversion is the point of the funnel; it is offered once, here (1B-10). -->
          <DsButton
            v-if="lead.client"
            variant="secondary"
            icon-right="arrow-right"
            @click="navigateTo(`/admin/clients/${lead.client.id}`)"
          >
            {{ lead.client.code }} үйлчлүүлэгч рүү
          </DsButton>
          <DsButton
            v-else
            variant="accent"
            icon-left="user-plus"
            @click="navigateTo(`/admin/clients/new?leadId=${lead.id}`)"
          >
            Хэрэглэгч болгох
          </DsButton>
        </div>
      </header>

      <div class="gks-lead__grid">
        <div class="gks-lead__main">
          <!-- Stage transition -->
          <DsCard title="Үе шат шилжүүлэх">
            <div v-if="nextStages.length" class="gks-lead__transition">
              <DsSelect
                v-model="transitionTarget"
                :options="[{ value: '', label: 'Шилжих үе шат сонгох' }, ...nextStages.map((s) => ({ value: s, label: LEAD_STAGE_LABELS[s] }))]"
              />
              <DsTextarea
                v-if="transitionTarget === 'LOST'"
                v-model="lostReason"
                label="Алдсан шалтгаан"
                :rows="2"
              />
              <DsButton :disabled="!transitionTarget" :loading="transitionPending" @click="submitTransition">
                Шилжүүлэх
              </DsButton>
              <p v-if="transitionErrorMsg" class="gks-lead__error">{{ transitionErrorMsg }}</p>
            </div>
            <p v-else class="gks-lead__unknown">Энэ үе шатнаас цаашид шилжих боломжгүй.</p>
          </DsCard>

          <!-- Facts -->
          <DsCard title="Мэдээлэл">
            <dl class="gks-lead__facts">
              <CommonDataValue label="Нас" :value="lead.age ? `${lead.age} нас` : null" />
              <CommonDataValue label="Боловсрол" :value="lead.educationLevel ? EDUCATION_LEVEL_LABELS[lead.educationLevel as EducationLevel] : null" />
              <CommonDataValue label="Дундаж (GPA)" :value="lead.gpa ? String(lead.gpa) : null" />
              <CommonDataValue label="Солонгос хэл" :value="lead.koreanLevel" />
              <CommonDataValue label="Англи хэл" :value="lead.englishLevel" />
              <CommonDataValue label="Сонирхож буй үйлчилгээ" :value="lead.interestedServices.length ? lead.interestedServices.map((s: ServiceType) => SERVICE_LABELS[s]).join(', ') : null" />
              <CommonDataValue label="Сонирхож буй мэргэжил" :value="lead.interestedMajor" />
            </dl>
            <p v-if="lead.note" class="gks-lead__note">{{ lead.note }}</p>
          </DsCard>

          <!-- Activity timeline -->
          <DsCard title="Түүх">
            <div class="gks-lead__composer">
              <DsSelect v-model="newActivityType" :options="ACTIVITY_TYPES.map((t) => ({ value: t, label: LEAD_ACTIVITY_TYPE_LABELS[t] }))" />
              <DsTextarea v-model="newActivityBody" placeholder="Тэмдэглэл бичих…" :rows="2" />
              <DsButton size="sm" :disabled="!newActivityBody.trim()" :loading="activitySubmitting" @click="submitActivity">Нэмэх</DsButton>
            </div>

            <ol class="gks-timeline">
              <li v-for="activity in activities" :key="activity.id" class="gks-timeline__item">
                <div class="gks-timeline__head">
                  <DsBadge tone="neutral">{{ LEAD_ACTIVITY_TYPE_LABELS[activity.type] }}</DsBadge>
                  <span class="gks-timeline__date gks-tnum">{{ formatDateTime(activity.occurredAt) }}</span>
                </div>
                <p v-if="activity.body" class="gks-timeline__body">{{ activity.body }}</p>
                <p v-if="activity.actor" class="gks-timeline__actor">— {{ activity.actor.name ?? 'Систем' }}</p>
              </li>
            </ol>
            <p v-if="!activities.length && !activitiesPending" class="gks-lead__unknown">Түүх алга байна.</p>
            <DsButton
              v-if="activitiesPage < activitiesTotalPages"
              variant="ghost"
              size="sm"
              :loading="activitiesPending"
              @click="loadActivities(activitiesPage + 1)"
            >
              Илүү ихийг харах
            </DsButton>
          </DsCard>
        </div>

        <aside class="gks-lead__side">
          <DsCard title="Хариуцагч">
            <p class="gks-lead__assignee">{{ lead.assignedTo?.name ?? lead.assignedTo?.email ?? 'Хараахан оноогоогүй' }}</p>
            <div class="gks-lead__assign-actions">
              <DsButton size="sm" variant="secondary" :loading="assignPending" @click="assignToSelf">Надад оноох</DsButton>
              <DsButton size="sm" variant="secondary" :loading="assignPending" @click="autoAssign">Автоматаар оноох</DsButton>
              <DsButton v-if="lead.assignedToId" size="sm" variant="ghost" :loading="assignPending" @click="unassign">Хариуцагчгүй болгох</DsButton>
            </div>
          </DsCard>

          <DsCard v-if="duplicates.length" title="Давхардсан байж болзошгүй" accent>
            <p class="gks-lead__dup-note">
              Ижил утас/имэйлтэй бичлэг олдлоо. Нэгтгэвэл тэдгээрийн түүх энэ бичлэг рүү шилжинэ.
            </p>
            <p v-if="mergeError" class="gks-lead__dup-error">{{ mergeError }}</p>
            <ul class="gks-lead__dup-list">
              <li v-for="dup in duplicates" :key="dup.id" class="gks-lead__dup">
                <NuxtLink :to="`/admin/consultations/${dup.id}`" class="gks-lead__dup-name">
                  {{ dup.lastName }} {{ dup.firstName }}
                </NuxtLink>
                <span class="gks-lead__dup-meta gks-tnum">
                  {{ dup.phone }} · {{ matchLabel(dup.matchedOn) }} таарсан
                </span>
                <DsButton
                  size="sm"
                  variant="secondary"
                  icon-left="merge"
                  :loading="merging === dup.id"
                  @click="mergeInto(dup)"
                >
                  Энэ рүү нэгтгэх
                </DsButton>
              </li>
            </ul>
          </DsCard>

          <DsCard title="Дараагийн алхам">
            <DsInput v-model="nextContactDraft" type="date" label="Дараагийн холбогдох огноо" />
            <DsInput v-model="winProbabilityDraft" type="number" min="0" max="100" label="Гэрээ болох магадлал (%)" />
            <DsButton size="sm" :loading="savingFacts" @click="saveFacts">Хадгалах</DsButton>
          </DsCard>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gks-lead { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-lead__back {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  text-decoration: none;
  align-self: flex-start;
}
.gks-lead__back:hover { color: var(--brand-600); }

.gks-lead__skeleton { height: 400px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }

.gks-lead__head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--sp-4); }
.gks-lead__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-lead__tags { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.gks-lead__head-side { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-end; }
.gks-lead__contact { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-end; }
.gks-lead__contact-link { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); text-decoration: none; }
.gks-lead__contact-link:hover { color: var(--brand-600); }

.gks-lead__grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--sp-5); align-items: start; }
.gks-lead__main { display: flex; flex-direction: column; gap: var(--sp-5); min-width: 0; }
.gks-lead__side { display: flex; flex-direction: column; gap: var(--sp-5); }

.gks-lead__dup-note { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-lead__dup-error { font-size: var(--fs-micro); color: var(--danger-600, #b00020); }
.gks-lead__dup-list { list-style: none; margin: var(--sp-3) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-lead__dup { display: flex; flex-direction: column; gap: var(--sp-1); align-items: flex-start; }
.gks-lead__dup-name { font-size: var(--fs-small); font-weight: var(--fw-semibold); color: var(--text-body); text-decoration: none; }
.gks-lead__dup-name:hover { color: var(--brand-600); }
.gks-lead__dup-meta { font-size: 11px; color: var(--text-subtle); }

.gks-lead__transition { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-lead__unknown { color: var(--text-subtle); font-style: italic; }
.gks-lead__error { color: var(--danger-fg); font-size: var(--fs-caption); }

.gks-lead__facts { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-lead__note { margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); color: var(--text-muted); line-height: var(--lh-body); white-space: pre-line; }

.gks-lead__composer { display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: var(--sp-4); margin-bottom: var(--sp-4); border-bottom: var(--border-hair) solid var(--line-hairline); }

.gks-timeline { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-timeline__item { padding-bottom: var(--sp-4); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-timeline__item:last-child { border-bottom: 0; padding-bottom: 0; }
.gks-timeline__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-timeline__date { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-timeline__body { margin-top: var(--sp-2); color: var(--text-body); line-height: var(--lh-body); white-space: pre-line; }
.gks-timeline__actor { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-lead__assignee { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-lead__assign-actions { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-3); }

@media (max-width: 900px) {
  .gks-lead__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
