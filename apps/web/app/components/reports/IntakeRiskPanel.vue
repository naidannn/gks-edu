<script setup lang="ts">
import type { IntakeRiskReport } from '@gks/shared';

/**
 * Will we make the intake?
 *
 * The countdown runs to **our** deadline, not the school's: `internalDeadline`
 * sits `internalLeadDays` earlier, and translation, notarisation and postage
 * live in that gap. The school's date is deliberately absent — given two dates
 * people work to the later one.
 *
 * This report takes no period. A deadline does not belong to a reporting month.
 */
const props = defineProps<{ report: IntakeRiskReport; download: (report: string) => void }>();

const horizon = defineModel<number>('horizonDays', { required: true });

const HORIZONS = [
  { value: '30', label: '30 хоног' },
  { value: '60', label: '60 хоног' },
  { value: '120', label: '120 хоног' },
  { value: '240', label: '240 хоног' },
];

/** Red inside a fortnight, amber inside a month; anything further is just a date. */
function urgency(daysLeft: number | null): 'danger' | 'warning' | 'neutral' {
  if (daysLeft === null) return 'neutral';
  if (daysLeft <= 14) return 'danger';
  if (daysLeft <= 30) return 'warning';
  return 'neutral';
}

const atRisk = computed(() => props.report.terms.reduce((sum, term) => sum + term.atRiskCount, 0));
</script>

<template>
  <DsCard title="Элсэлтийн хугацааны эрсдэл" eyebrow="Одоогийн байдлаар — дотоод эцсийн хугацаагаар">
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('intake-risk')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <p class="gks-reports__note">
      Бүх тоолол <strong>дотоод эцсийн хугацаа</strong> дээр явна — сургуулийн зарласан өдөр биш.
      Хоёрын хооронд орчуулга, нотариат, шуудан багтдаг.
    </p>

    <div class="gks-intake__horizon">
      <DsSelect
        :model-value="String(horizon)"
        :options="HORIZONS"
        label="Хэдэн хоног урагш харах"
        @update:model-value="horizon = Number($event)"
      />
    </div>

    <div class="gks-stats gks-reports__section">
      <div class="gks-stat" :class="{ 'gks-stat--danger': atRisk > 0 }">
        <span class="gks-stat__label">Мэдүүлээгүй, хугацаа дөхсөн хэрэг</span>
        <span class="gks-stat__value gks-tnum">{{ atRisk }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Хугацаа дөхсөн элсэлтийн улирал</span>
        <span class="gks-stat__value gks-tnum">{{ report.terms.length }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--warn': report.casesWithoutIntake > 0 }">
        <span class="gks-stat__label">Улирал сонгоогүй хэрэг</span>
        <span class="gks-stat__value gks-tnum">{{ report.casesWithoutIntake }}</span>
        <span class="gks-stat__foot">Хугацаа нь хэзээ болохыг хэлэх боломжгүй</span>
      </div>
    </div>
  </DsCard>

  <DsCard title="Элсэлтийн улирлаар">
    <div v-if="report.terms.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Сургууль</th>
            <th scope="col">Түвшин</th>
            <th scope="col">Улирал</th>
            <th scope="col">Дотоод эцсийн хугацаа</th>
            <th scope="col" class="gks-table__num">Хэрэг</th>
            <th scope="col" class="gks-table__num">Мэдүүлсэн</th>
            <th scope="col" class="gks-table__num">Материал бүрдсэн</th>
            <th scope="col" class="gks-table__num">Эрсдэлтэй</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="term in report.terms" :key="term.intakeId">
            <td>{{ term.universityNameMn }}</td>
            <td>{{ PROGRAM_LEVEL_LABELS[term.level] }}</td>
            <td class="gks-tnum">{{ term.year }}/{{ term.month }}</td>
            <td>
              <DsBadge :tone="urgency(term.daysLeft) === 'neutral' ? 'neutral' : urgency(term.daysLeft)">
                {{ deadlineCountdownLabel(term.daysLeft) }}
              </DsBadge>
              <span class="gks-reports__sub gks-tnum">
                {{ term.internalDeadline ? formatNumericDateUtc(term.internalDeadline) : '—' }}
              </span>
            </td>
            <td class="gks-table__num gks-tnum">{{ term.caseCount }}</td>
            <td class="gks-table__num gks-tnum">{{ term.submittedCount }}</td>
            <td class="gks-table__num gks-tnum">{{ term.documentsReadyCount }}</td>
            <td class="gks-table__num gks-tnum" :class="{ 'gks-table__num--warn': term.atRiskCount > 0 }">
              {{ term.atRiskCount }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Сонгосон хугацаанд дотоод эцсийн хугацаа дөхсөн улирал алга.</p>
  </DsCard>

  <DsCard title="Эрсдэлтэй хэргүүд" :eyebrow="`${report.cases.length} хэрэг`">
    <div v-if="report.cases.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Хэрэг</th>
            <th scope="col">Үйлчлүүлэгч</th>
            <th scope="col">Хариуцагч</th>
            <th scope="col">Үе шат</th>
            <th scope="col">Сургууль</th>
            <th scope="col">Үлдсэн</th>
            <th scope="col" class="gks-table__num">Материал</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.cases" :key="row.caseId">
            <td><NuxtLink :to="`/admin/cases/${row.caseId}`">{{ row.caseCode }}</NuxtLink></td>
            <td>{{ row.clientName ?? '—' }}</td>
            <td>
              {{ row.consultantName ?? '—' }}
              <span v-if="row.docOfficerName" class="gks-reports__sub">{{ row.docOfficerName }}</span>
            </td>
            <td><DsBadge :tone="CASE_STAGE_TONE[row.stage]">{{ CASE_STAGE_LABELS[row.stage] }}</DsBadge></td>
            <td>{{ row.universityNameMn ?? '—' }}</td>
            <td>
              <DsBadge :tone="urgency(row.daysLeft) === 'neutral' ? 'neutral' : urgency(row.daysLeft)">
                {{ deadlineCountdownLabel(row.daysLeft) }}
              </DsBadge>
            </td>
            <td class="gks-table__num gks-tnum" :class="{ 'gks-table__num--warn': row.overdueDocs > 0 }">
              {{ row.requiredDocsDone }}/{{ row.requiredDocsTotal }}
              <template v-if="row.overdueDocs">· {{ row.overdueDocs }} хэтэрсэн</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Хугацаанд амжихгүй эрсдэлтэй хэрэг алга.</p>
  </DsCard>
</template>

<style scoped>
/* A four-option select has no business filling a 2,500px card. */
.gks-intake__horizon { max-width: 220px; margin-top: var(--sp-4); }
</style>
