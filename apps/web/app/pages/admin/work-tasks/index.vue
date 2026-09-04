<script setup lang="ts">
import type { WorkTask, WorkTaskStatus, WorkTaskType } from '@gks/shared';

/**
 * 1D-10 — translation and other back-office work (gksedu.md §6.4): who is doing
 * what, by when, and how loaded each person is.
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });

type Paginated = { items: WorkTask[]; meta: { page: number; limit: number; total: number; totalPages: number } };
type StaffMember = { id: string; name: string | null; email: string | null; role: string };
type Workload = { rows: { assigneeId: string | null; status: WorkTaskStatus; _count: { _all: number } }[]; overdue: number };

const STATUS_OPTIONS: { value: WorkTaskStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(WORK_TASK_STATUS_LABELS) as [WorkTaskStatus, string][]).map(([value, label]) => ({ value, label })),
];
const TYPE_OPTIONS = (Object.entries(WORK_TASK_TYPE_LABELS) as [WorkTaskType, string][]).map(([value, label]) => ({ value, label }));

const api = useApi();
const status = ref<WorkTaskStatus | ''>('');
const assigneeId = ref('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const staff = ref<StaffMember[]>([]);
const workload = ref<Workload | null>(null);
const pending = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const draft = reactive({ caseId: '', type: 'TRANSLATION' as WorkTaskType, title: '', assigneeId: '', dueAt: '' });

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(status.value ? { status: status.value } : {}),
  ...(assigneeId.value ? { assigneeId: assigneeId.value } : {}),
}));

async function load() {
  pending.value = true;
  try {
    const [list, people, load_] = await Promise.all([
      api.get<Paginated>('/work-tasks', { query: query.value }),
      api.get<StaffMember[]>('/users/staff'),
      api.get<Workload>('/work-tasks/workload'),
    ]);
    data.value = list;
    staff.value = people;
    workload.value = load_;
  } finally {
    pending.value = false;
  }
}

watch([status, assigneeId], () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const ASSIGNEE_OPTIONS = computed(() => [
  { value: '', label: 'Бүх ажилтан' },
  ...staff.value.map((person) => ({ value: person.id, label: person.name ?? person.email ?? person.id })),
]);

/** Open tasks per person — the input to the staff workload view (§15.6). */
const perPerson = computed(() => {
  const counts = new Map<string, number>();
  for (const row of workload.value?.rows ?? []) {
    if (!row.assigneeId) continue;
    counts.set(row.assigneeId, (counts.get(row.assigneeId) ?? 0) + row._count._all);
  }
  return staff.value
    .map((person) => ({ person, open: counts.get(person.id) ?? 0 }))
    .filter((row) => row.open > 0)
    .sort((a, b) => b.open - a.open);
});

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

function create() {
  return act(() =>
    api.post('/work-tasks', {
      caseId: draft.caseId,
      type: draft.type,
      title: draft.title,
      assigneeId: draft.assigneeId || undefined,
      dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : undefined,
    }),
  ).then(() => { draft.title = ''; draft.caseId = ''; });
}

function setStatus(task: WorkTask, next: WorkTaskStatus) {
  return act(() => api.patch(`/work-tasks/${task.id}`, { status: next }));
}
function assign(task: WorkTask, personId: string) {
  return act(() => api.patch(`/work-tasks/${task.id}`, { assigneeId: personId }));
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' }) : '—';
}
function isOverdue(task: WorkTask): boolean {
  return Boolean(task.dueAt) && task.status !== 'DONE' && new Date(task.dueAt!).getTime() < Date.now();
}

useHead({ title: 'Материалын ажил · CRM' });
</script>

<template>
  <div class="gks-tasks">
    <header class="gks-tasks__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-tasks__title">Материал боловсруулах ажил</h1>
      <p v-if="data" class="gks-tasks__count gks-tnum">
        {{ data.meta.total }} даалгавар · {{ workload?.overdue ?? 0 }} хугацаа хэтэрсэн
      </p>
    </header>

    <p v-if="error" class="gks-tasks__error">{{ error }}</p>

    <DsCard v-if="perPerson.length" title="Ажилтны ачаалал" eyebrow="Нээлттэй даалгавар">
      <ul class="gks-tasks__workload">
        <li v-for="row in perPerson" :key="row.person.id">
          <span>{{ row.person.name ?? row.person.email }}</span>
          <span class="gks-tnum">{{ row.open }}</span>
        </li>
      </ul>
    </DsCard>

    <DsCard title="Шинэ даалгавар">
      <div class="gks-tasks__form">
        <DsInput v-model="draft.caseId" label="Хэргийн ID" placeholder="UUID" />
        <DsSelect v-model="draft.type" label="Төрөл" :options="TYPE_OPTIONS" />
        <DsInput v-model="draft.title" label="Гарчиг" />
        <DsSelect v-model="draft.assigneeId" label="Хариуцагч" :options="ASSIGNEE_OPTIONS" />
        <DsInput v-model="draft.dueAt" type="date" label="Эцсийн хугацаа" />
      </div>
      <DsButton variant="accent" :disabled="!draft.caseId || !draft.title || busy" @click="create">Үүсгэх</DsButton>
    </DsCard>

    <DsCard>
      <div class="gks-tasks__filters">
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="assigneeId" :options="ASSIGNEE_OPTIONS" aria-label="Хариуцагч" />
      </div>
    </DsCard>

    <div v-if="pending && !data" class="gks-tasks__skeleton"><div v-for="n in 5" :key="n" class="gks-tasks__skeleton-row" /></div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-tasks__empty">Даалгавар алга байна.</p></DsCard>

    <div v-else class="gks-tasks__table-wrap">
      <table class="gks-table">
        <thead>
          <tr><th>Хэрэг</th><th>Даалгавар</th><th>Төрөл</th><th>Хариуцагч</th><th>Хугацаа</th><th>Төлөв</th><th /></tr>
        </thead>
        <tbody>
          <tr v-for="task in data.items" :key="task.id">
            <td class="gks-tnum">{{ task.case?.code ?? '—' }}</td>
            <td>
              {{ task.title }}
              <span v-if="task.caseDocument" class="gks-tasks__doc">{{ task.caseDocument.template.nameMn }}</span>
            </td>
            <td>{{ WORK_TASK_TYPE_LABELS[task.type] }}</td>
            <td>
              <DsSelect
                :model-value="task.assigneeId ?? ''"
                :options="ASSIGNEE_OPTIONS"
                aria-label="Хариуцагч"
                @update:model-value="assign(task, $event)"
              />
            </td>
            <td class="gks-tnum" :class="{ 'gks-tasks__overdue': isOverdue(task) }">{{ formatDate(task.dueAt) }}</td>
            <td><DsBadge :tone="task.status === 'DONE' ? 'success' : task.status === 'CANCELLED' ? 'neutral' : 'info'">{{ WORK_TASK_STATUS_LABELS[task.status] }}</DsBadge></td>
            <td>
              <DsButton v-if="task.status === 'TODO'" size="sm" variant="ghost" @click="setStatus(task, 'IN_PROGRESS')">Эхлүүлэх</DsButton>
              <DsButton v-else-if="task.status === 'IN_PROGRESS'" size="sm" variant="ghost" @click="setStatus(task, 'DONE')">Дуусгах</DsButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
.gks-tasks { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-tasks__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-tasks__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-tasks__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-tasks__workload { display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-tasks__workload li { display: flex; justify-content: space-between; gap: var(--sp-3); }
.gks-tasks__form { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
.gks-tasks__filters { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.gks-tasks__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-tasks__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-tasks__empty { text-align: center; color: var(--text-muted); }
.gks-tasks__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); background: var(--surface-sunken); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); vertical-align: middle; }
.gks-tasks__doc { display: block; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-tasks__overdue { color: var(--danger-fg); font-weight: var(--fw-semibold); }
.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 900px) { .gks-tasks__filters { grid-template-columns: 1fr; } }
</style>
