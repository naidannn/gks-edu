<script setup lang="ts">
import type { AdmissionBoardCase, AdmissionBoardGroup } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * The intake board (1H-08) — cases lined up under the round they are racing.
 *
 * This is the screen the office asked for by name: "ажилтан хүртэл хэрэглэгчээ
 * мартаад". A forgotten case is invisible on a per-case screen and obvious
 * here, because every case sitting under the same closing date is shown
 * together, least prepared first.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Элсэлтийн самбар · Админ' });

const api = useApi();

const groups = ref<AdmissionBoardGroup[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const onlyAtRisk = ref(false);
const onlyMine = ref(false);

const auth = useAuthStore();

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    groups.value = await api.get<AdmissionBoardGroup[]>('/admin/admissions/board', {
      query: {
        ...(onlyAtRisk.value ? { onlyAtRisk: 'true' } : {}),
        ...(onlyMine.value && auth.user?.id ? { assigneeId: auth.user.id } : {}),
      },
    });
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Элсэлтийн самбарыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}

watch([onlyAtRisk, onlyMine], load);
onMounted(load);

const totalCases = computed(() => groups.value.reduce((sum, group) => sum + group.cases.length, 0));
const totalAtRisk = computed(() => groups.value.reduce((sum, group) => sum + group.atRiskCount, 0));

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function countdownLabel(days: number | null): string {
  if (days === null) return 'Хугацаа оруулаагүй';
  if (days < 0) return `${Math.abs(days)} хоногоор хэтэрсэн`;
  if (days === 0) return 'Өнөөдөр хаагдана';
  return `${days} хоног үлдлээ`;
}

function countdownTone(days: number | null): BadgeTone {
  if (days === null) return 'warning';
  if (days < 0) return 'danger';
  if (days <= 7) return 'danger';
  if (days <= 21) return 'warning';
  return 'success';
}

/** Who to chase. An unassigned case is the worst version of this problem. */
function ownerLabel(row: AdmissionBoardCase): string {
  const names = [row.assignedConsultant?.name, row.assignedDocOfficer?.name].filter(Boolean);
  return names.length ? names.join(', ') : 'Хариуцагчгүй';
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Элсэлт</span>
        <h1 class="gks-page__title">Элсэлтийн самбар</h1>
        <p class="gks-page__hint">
          Хэрэг бүр өөрийн элсэлтийн доор, материалын бэлэн байдлаар эрэмбэлэгдэнэ. Хамгийн дутуу нь
          дээрээ — тэр хэрэг л хугацаагаа алдах эрсдэлтэй.
        </p>
      </div>
      <div class="gks-board__totals">
        <span class="gks-tnum">{{ totalCases }} хэрэг</span>
        <DsBadge v-if="totalAtRisk" tone="danger">{{ totalAtRisk }} эрсдэлтэй</DsBadge>
      </div>
    </header>

    <div class="gks-toggles">
      <DsTag clickable :selected="onlyAtRisk" @click="onlyAtRisk = !onlyAtRisk">Зөвхөн эрсдэлтэй</DsTag>
      <DsTag clickable :selected="onlyMine" @click="onlyMine = !onlyMine">Зөвхөн миний хэрэг</DsTag>
    </div>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <div v-else-if="pending && !groups.length" class="gks-skeleton gks-skeleton--group">
      <div v-for="n in 3" :key="n" class="gks-skeleton__row" />
    </div>

    <DsCard v-else-if="!groups.length">
      Элсэлт сонгосон нээлттэй хэрэг алга байна. Хэрэг үүсгэхдээ элсэлтийн улирлыг нь заавал сонгоно уу —
      эс бөгөөс энэ самбар түүнийг хянаж чадахгүй.
    </DsCard>

    <section v-for="group in groups" v-else :key="group.intake.id" class="gks-board__group">
      <header class="gks-board__group-head">
        <div>
          <h2>{{ universityName(group.intake.university) }}</h2>
          <p>
            {{ group.intake.year }} оны
            {{ INTAKE_MONTH_LABELS[group.intake.month] ?? `${group.intake.month}-р сар` }} ·
            {{ PROGRAM_LEVEL_LABELS[group.intake.level] }}
          </p>
        </div>
        <div class="gks-board__group-meta">
          <span>
            Манай эцсийн хугацаа
            <strong class="gks-tnum">{{ formatDate(group.intake.internalDeadline) }}</strong>
          </span>
          <DsBadge :tone="countdownTone(group.intake.daysUntilInternalDeadline)">
            {{ countdownLabel(group.intake.daysUntilInternalDeadline) }}
          </DsBadge>
          <DsBadge v-if="group.atRiskCount" tone="danger">{{ group.atRiskCount }} эрсдэлтэй</DsBadge>
        </div>
      </header>

      <div class="gks-table-wrap gks-table-wrap--auto">
        <table class="gks-table gks-table--cards">
          <thead>
            <tr>
              <th scope="col">Хэрэг</th>
              <th scope="col">Үйлчлүүлэгч</th>
              <th scope="col">Үе шат</th>
              <th scope="col">Материал</th>
              <th scope="col">Бэлэн байдал</th>
              <th scope="col">Хариуцагч</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in group.cases"
              :key="row.caseId"
              :class="{ 'gks-board__row--risk': row.atRisk }"
              @click="navigateTo(`/admin/cases/${row.caseId}`)"
            >
              <td class="gks-tnum" data-label="Хэрэг">{{ row.code }}</td>
              <td data-label="Үйлчлүүлэгч">{{ row.clientName }}</td>
              <td data-label="Үе шат">{{ CASE_STAGE_LABELS[row.stage] }}</td>
              <td class="gks-tnum" data-label="Материал">
                {{ row.approvedDocuments }}/{{ row.requiredDocuments }}
                <small v-if="row.missingDocuments">{{ row.missingDocuments }} дутуу</small>
              </td>
              <td data-label="Бэлэн байдал">
                <div class="gks-board__readiness">
                  <div class="gks-board__bar">
                    <span :style="{ width: `${row.readiness}%` }" :class="{ 'is-risk': row.atRisk }" />
                  </div>
                  <strong class="gks-tnum">{{ row.readiness }}%</strong>
                </div>
              </td>
              <td :class="{ 'gks-board__unowned': !row.assignedConsultant && !row.assignedDocOfficer }" data-label="Хариуцагч">
                {{ ownerLabel(row) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gks-board__totals { display: flex; align-items: center; gap: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-body-sm); }

.gks-board__group { border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); overflow: hidden; }
.gks-board__group-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); padding: var(--sp-4); border-bottom: 1px solid var(--line-soft); background: var(--surface-sunken, var(--n-050)); }
.gks-board__group-head h2 { font-size: var(--fs-body); font-weight: var(--fw-semibold); }
.gks-board__group-head p { margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-board__group-meta { display: flex; align-items: center; gap: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-board__group-meta strong { margin-left: 4px; color: var(--brand-700); }

.gks-table-wrap tbody tr { cursor: pointer; }
.gks-board__row--risk td { background: var(--red-050); }
.gks-table-wrap td small { display: block; margin-top: 2px; color: var(--red-700); font-size: var(--fs-caption); }

.gks-board__readiness { display: flex; align-items: center; gap: var(--sp-2); }
.gks-board__bar { width: 80px; height: 6px; overflow: hidden; border-radius: var(--radius-pill); background: var(--n-100); }
.gks-board__bar span { display: block; height: 100%; border-radius: inherit; background: var(--brand-600); }
.gks-board__bar span.is-risk { background: var(--red-600, var(--red-700)); }
.gks-board__unowned { color: var(--red-700); font-weight: var(--fw-semibold); }

@media (max-width: 900px) {
  .gks-board__group-head { flex-direction: column; align-items: flex-start; }
}
</style>
