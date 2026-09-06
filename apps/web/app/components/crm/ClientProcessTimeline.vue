<script setup lang="ts">
import type { CaseStage, WorkTask, WorkspaceCase } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * Process tab (1G-17) — the whole service lifecycle for one case: the stages
 * behind and ahead, who is responsible, the open back-office work, and the
 * school/visa desks that own the deep forms.
 *
 * The stage move is the same guarded `POST /cases/:id/transitions` the old
 * `/admin/cases/:id` screen called; system transitions (payment, contract)
 * still cannot be forced by hand.
 */
const props = defineProps<{ workspaceCase: WorkspaceCase }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();
type StaffMember = { id: string; name: string | null; email: string | null; role: string };
type Paginated<T> = { items: T[] };

const staff = ref<StaffMember[]>([]);
const tasks = ref<WorkTask[]>([]);
const busy = ref(false);
const errorMsg = ref<string | null>(null);

const caseId = computed(() => props.workspaceCase.id);

async function loadSide() {
  const [people, taskList] = await Promise.all([
    api.get<StaffMember[]>('/users/staff'),
    api.get<Paginated<WorkTask>>('/work-tasks', { query: { caseId: caseId.value, limit: 50 } }),
  ]);
  staff.value = people;
  tasks.value = taskList.items;
}
onMounted(loadSide);
watch(caseId, loadSide);

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  errorMsg.value = null;
  try {
    await action();
    await loadSide();
    emit('changed');
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

// ── Stage move ─────────────────────────────────────────────────────────────
const ALL_STAGES = Object.keys(CASE_STAGE_LABELS) as CaseStage[];
const targetStage = ref<CaseStage | ''>('');
const reason = ref('');
const stageOptions = computed(() => [
  { value: '', label: 'Шилжих үе шат сонгох' },
  ...ALL_STAGES.filter((s) => s !== props.workspaceCase.stage).map((s) => ({ value: s, label: CASE_STAGE_LABELS[s] })),
]);

function moveStage() {
  if (!targetStage.value) return;
  return act(async () => {
    await api.post(`/cases/${caseId.value}/transitions`, {
      toStage: targetStage.value,
      reason: reason.value || undefined,
    });
    targetStage.value = '';
    reason.value = '';
  });
}

// ── Assignment ─────────────────────────────────────────────────────────────
const consultantId = ref('');
const docOfficerId = ref('');
watch(
  () => props.workspaceCase,
  (row) => {
    consultantId.value = row.assignedConsultant?.id ?? '';
    docOfficerId.value = row.assignedDocOfficer?.id ?? '';
  },
  { immediate: true },
);

const consultantOptions = computed(() => [
  { value: '', label: 'Хариуцагчгүй' },
  ...staff.value
    .filter((person) => person.role === 'ADMIN' || person.role === 'CONSULTANT')
    .map((person) => ({ value: person.id, label: person.name ?? person.email ?? person.id })),
]);
const docOfficerOptions = computed(() => [
  { value: '', label: 'Хариуцагчгүй' },
  ...staff.value
    .filter((person) => person.role === 'ADMIN' || person.role === 'DOC_OFFICER')
    .map((person) => ({ value: person.id, label: person.name ?? person.email ?? person.id })),
]);

function saveAssignment() {
  return act(() =>
    api.patch(`/cases/${caseId.value}/assign`, {
      assignedConsultantId: consultantId.value || undefined,
      assignedDocOfficerId: docOfficerId.value || undefined,
    }),
  );
}

function setTaskStatus(task: WorkTask, status: WorkTask['status']) {
  return act(() => api.patch(`/work-tasks/${task.id}`, { status }));
}

// ── Presentation ───────────────────────────────────────────────────────────
/** When each stage of the journey was reached, from the case's own history. */
const reachedAt = computed(() => {
  const map = new Map<CaseStage, string>();
  for (const transition of [...props.workspaceCase.transitions].reverse()) {
    if (!map.has(transition.toStage)) map.set(transition.toStage, transition.createdAt);
  }
  return map;
});

const currentIndex = computed(() => props.workspaceCase.journey.indexOf(props.workspaceCase.stage));

function stageState(index: number): 'done' | 'current' | 'todo' {
  if (currentIndex.value < 0) return 'todo';
  if (index < currentIndex.value) return 'done';
  return index === currentIndex.value ? 'current' : 'todo';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function isOverdue(task: WorkTask): boolean {
  return Boolean(task.dueAt) && task.status !== 'DONE' && new Date(task.dueAt!).getTime() < Date.now();
}
</script>

<template>
  <div class="gks-cproc">
    <DsCard v-if="errorMsg" accent><p class="gks-cproc__error">{{ errorMsg }}</p></DsCard>

    <div class="gks-cproc__cols">
      <div class="gks-cproc__main">
        <DsCard title="Үйлчилгээний явц" :eyebrow="SERVICE_LABELS[workspaceCase.serviceType]">
          <p v-if="currentIndex < 0" class="gks-cproc__off">
            <DsBadge tone="warning">{{ CASE_STAGE_LABELS[workspaceCase.stage] }}</DsBadge>
            Энэ үйлчилгээ үндсэн урсгалаас түр гарсан байна.
          </p>

          <ol class="gks-cproc__steps">
            <li
              v-for="(stage, index) in workspaceCase.journey"
              :key="stage"
              class="gks-cproc__step"
              :class="`gks-cproc__step--${stageState(index)}`"
            >
              <span class="gks-cproc__marker">
                <DsIcon v-if="stageState(index) === 'done'" name="check" :size="12" />
                <span v-else class="gks-cproc__dot" />
              </span>
              <span class="gks-cproc__step-label">{{ CASE_STAGE_LABELS[stage] }}</span>
              <span class="gks-cproc__step-date gks-tnum">{{ formatDate(reachedAt.get(stage)) }}</span>
            </li>
          </ol>
        </DsCard>

        <DsCard title="Сургууль ба виз">
          <div class="gks-cproc__desks">
            <div class="gks-cproc__desk">
              <div>
                <p class="gks-cproc__desk-label">Мэдүүлэг</p>
                <p class="gks-cproc__desk-value">
                  {{ workspaceCase.application ? APPLICATION_STATUS_LABELS[workspaceCase.application.status] : 'Нээгээгүй' }}
                </p>
              </div>
              <DsButton
                size="sm"
                variant="secondary"
                icon-right="arrow-up-right"
                @click="navigateTo(`/admin/applications/${workspaceCase.id}`)"
              >
                Мэдүүлгийн самбар
              </DsButton>
            </div>

            <div class="gks-cproc__desk">
              <div>
                <p class="gks-cproc__desk-label">Виз</p>
                <p class="gks-cproc__desk-value">
                  {{ workspaceCase.visaCase ? VISA_STATUS_LABELS[workspaceCase.visaCase.status] : 'Эхлээгүй' }}
                  <span v-if="workspaceCase.visaCase?.appointmentAt" class="gks-tnum">
                    · {{ formatDate(workspaceCase.visaCase.appointmentAt) }}
                  </span>
                </p>
              </div>
              <DsButton size="sm" variant="secondary" icon-right="arrow-up-right" @click="navigateTo('/admin/visa')">
                Визний самбар
              </DsButton>
            </div>

            <div v-if="workspaceCase.departurePlan" class="gks-cproc__desk">
              <div>
                <p class="gks-cproc__desk-label">Явахын өмнөх бэлтгэл</p>
                <p class="gks-cproc__desk-value gks-tnum">{{ formatDate(workspaceCase.departurePlan.departureAt) }}</p>
              </div>
            </div>
          </div>
        </DsCard>

        <DsCard title="Дотоод ажил" :eyebrow="`${tasks.length} даалгавар`">
          <p v-if="!tasks.length" class="gks-cproc__muted">Энэ үйлчилгээнд даалгавар үүсээгүй байна.</p>
          <ul v-else class="gks-cproc__tasks">
            <li v-for="task in tasks" :key="task.id" class="gks-cproc__task">
              <div class="gks-cproc__task-text">
                <p class="gks-cproc__task-title">{{ task.title }}</p>
                <p class="gks-cproc__task-meta">
                  {{ WORK_TASK_TYPE_LABELS[task.type] }} ·
                  {{ task.assignee?.name ?? 'Хариуцагчгүй' }}
                  <span v-if="task.dueAt" class="gks-tnum" :class="{ 'gks-cproc__late': isOverdue(task) }">
                    · {{ formatDate(task.dueAt) }}
                  </span>
                </p>
              </div>
              <DsBadge :tone="isOverdue(task) ? 'danger' : task.status === 'DONE' ? 'success' : 'neutral'">
                {{ WORK_TASK_STATUS_LABELS[task.status] }}
              </DsBadge>
              <DsButton
                v-if="task.status !== 'DONE' && task.status !== 'CANCELLED'"
                size="sm"
                variant="ghost"
                :loading="busy"
                @click="setTaskStatus(task, 'DONE')"
              >
                Дуусгах
              </DsButton>
            </li>
          </ul>
          <NuxtLink to="/admin/work-tasks" class="gks-cproc__link">Бүх даалгавар →</NuxtLink>
        </DsCard>
      </div>

      <aside class="gks-cproc__side">
        <DsCard title="Үе шат шилжүүлэх">
          <div class="gks-cproc__form">
            <DsSelect v-model="targetStage" :options="stageOptions" aria-label="Шилжих үе шат" />
            <DsInput v-model="reason" label="Шалтгаан (заавал биш)" />
            <DsButton :disabled="!targetStage" :loading="busy" @click="moveStage">Шилжүүлэх</DsButton>
            <p class="gks-cproc__hint">
              Төлбөр, гэрээгээр автоматаар хийгддэг шилжилтийг энд гараар хийх боломжгүй.
            </p>
          </div>
        </DsCard>

        <DsCard title="Хариуцагч">
          <div class="gks-cproc__form">
            <DsSelect v-model="consultantId" label="Зөвлөх" :options="consultantOptions" />
            <DsSelect v-model="docOfficerId" label="Баримт хариуцагч" :options="docOfficerOptions" />
            <DsButton size="sm" variant="secondary" :loading="busy" @click="saveAssignment">Хадгалах</DsButton>
          </div>
        </DsCard>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.gks-cproc { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-cproc__cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--sp-4); align-items: start; }
.gks-cproc__main, .gks-cproc__side { display: flex; flex-direction: column; gap: var(--sp-4); min-width: 0; }
.gks-cproc__error { color: var(--danger-fg); }

.gks-cproc__off { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-4); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-cproc__steps { display: flex; flex-direction: column; }
.gks-cproc__step {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  font-size: var(--fs-body-sm);
}
.gks-cproc__marker {
  flex: none;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-pill);
  border: var(--border-hair) solid var(--line-soft);
  background: var(--surface-card);
  color: var(--text-inverse);
}
.gks-cproc__dot { width: 6px; height: 6px; border-radius: var(--radius-pill); background: var(--n-300); }
.gks-cproc__step--done .gks-cproc__marker { background: var(--green-600); border-color: var(--green-600); }
.gks-cproc__step--current .gks-cproc__marker { border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--surface-selected); }
.gks-cproc__step--current .gks-cproc__dot { background: var(--brand-600); }
.gks-cproc__step--current .gks-cproc__step-label { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-cproc__step--todo .gks-cproc__step-label { color: var(--text-subtle); }
.gks-cproc__step-label { flex: 1; min-width: 0; }
.gks-cproc__step-date { font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-cproc__desks { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-cproc__desk { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
.gks-cproc__desk-label { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cproc__desk-value { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }

.gks-cproc__tasks { display: flex; flex-direction: column; margin-bottom: var(--sp-3); }
.gks-cproc__task {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-cproc__task:last-child { border-bottom: 0; }
.gks-cproc__task-text { flex: 1; min-width: 0; }
.gks-cproc__task-title { font-size: var(--fs-body-sm); color: var(--text-strong); }
.gks-cproc__task-meta { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cproc__late { color: var(--danger-fg); font-weight: var(--fw-semibold); }

.gks-cproc__form { display: flex; flex-direction: column; gap: var(--sp-3); align-items: stretch; }
.gks-cproc__hint { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cproc__muted { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-cproc__link { font-size: var(--fs-caption); color: var(--brand-700); text-decoration: none; }

@media (max-width: 1100px) {
  .gks-cproc__cols { grid-template-columns: 1fr; }
}
</style>
