<script setup lang="ts">
import type { PipelineReport } from '@gks/shared';

/**
 * Where cases stop moving.
 *
 * The funnel's useful column is **шатны хөрвөлт** — the share of the previous
 * milestone that got here — not the share of the cohort. 90% reaching DOCUMENTS
 * says nothing next to 40% of DOCUMENTS reaching APPLICATION_SUBMITTED, and the
 * second number is the one that names the problem.
 */
defineProps<{ report: PipelineReport; download: (report: string) => void }>();
</script>

<template>
  <DsCard :title="`Юүлүүр · ${report.period.labelMn}`" :eyebrow="`${report.cohortSize} хэрэг нээгдсэн`">
    <p class="gks-reports__note">
      Энэ хугацаанд нээгдсэн хэргүүд ямар үе шат хүртэл явсныг харуулна. «Шатны хөрвөлт» нь
      өмнөх шатнаас хэдэн хувь нь цааш явсныг хэлэх тул алдагдал хаана болж байгааг заана.
    </p>

    <div class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Үе шат</th>
            <th scope="col" class="gks-table__num">Хүрсэн</th>
            <th scope="col" class="gks-table__num">Нийтээс</th>
            <th scope="col" class="gks-table__num">Шатны хөрвөлт</th>
            <th scope="col" class="gks-table__num">Дундаж хугацаа</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="step in report.funnel" :key="step.milestone">
            <td>{{ MILESTONE_LABELS[step.milestone] }}</td>
            <td class="gks-table__num gks-tnum">{{ step.reached }}</td>
            <td class="gks-table__num gks-tnum">{{ step.reachedPercent }}%</td>
            <td
              class="gks-table__num gks-tnum"
              :class="{ 'gks-table__num--warn': step.milestone !== 'CASE_OPENED' && step.stepPercent < 70 }"
            >
              {{ step.milestone === 'CASE_OPENED' ? '—' : `${step.stepPercent}%` }}
            </td>
            <td class="gks-table__num gks-tnum">
              {{ step.medianDays === null ? '—' : `${step.medianDays} хоног` }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </DsCard>

  <DsCard v-if="report.byService.length" title="Үйлчилгээ тус бүрээр" eyebrow="Хүрсэн хэргийн тоо">
    <div class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Үйлчилгээ</th>
            <th v-for="step in report.funnel" :key="step.milestone" scope="col" class="gks-table__num">
              {{ MILESTONE_LABELS[step.milestone] }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.byService" :key="row.serviceType">
            <td>{{ SERVICE_LABELS[row.serviceType] }}</td>
            <td v-for="step in row.funnel" :key="step.milestone" class="gks-table__num gks-tnum">
              {{ step.reached }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </DsCard>

  <DsCard title="Одоогийн ачаалал" eyebrow="Хугацаанаас хамаарахгүй">
    <ReportsBarList
      :rows="report.current.map((row) => ({
        key: row.stage,
        label: CASE_STAGE_LABELS[row.stage],
        value: row.count,
        tone: row.stalledCount > 0 ? 'warning' : 'brand',
        note: `${row.count} · дунджаар ${row.medianDaysInStage} хоног${row.stalledCount ? ` · ${row.stalledCount} гацсан` : ''}`,
      }))"
      empty-text="Идэвхтэй хэрэг алга."
    />
  </DsCard>

  <DsCard
    :title="`${report.stallThresholdDays} хоногоос дээш хөдөлгөөнгүй хэрэг`"
    :eyebrow="`${report.stalled.length} хэрэг`"
  >
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('stalled-cases')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <div v-if="report.stalled.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Хэрэг</th>
            <th scope="col">Үйлчлүүлэгч</th>
            <th scope="col">Зөвлөх</th>
            <th scope="col">Үйлчилгээ</th>
            <th scope="col">Үе шат</th>
            <th scope="col" class="gks-table__num">Хоносон хоног</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.stalled" :key="row.caseId">
            <td><NuxtLink :to="`/admin/cases/${row.caseId}`">{{ row.caseCode }}</NuxtLink></td>
            <td>{{ row.clientName ?? '—' }}</td>
            <td>{{ row.consultantName ?? '—' }}</td>
            <td>{{ SERVICE_LABELS[row.serviceType] }}</td>
            <td><DsBadge :tone="CASE_STAGE_TONE[row.stage]">{{ CASE_STAGE_LABELS[row.stage] }}</DsBadge></td>
            <td class="gks-table__num gks-tnum gks-table__num--warn">{{ row.daysInStage }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Гацсан хэрэг алга — бүх хэрэг хөдөлгөөнтэй байна.</p>
  </DsCard>

  <DsCard title="Зогссон ба хаагдсан хэрэг" eyebrow="Одоогийн байдлаар">
    <div class="gks-stats">
      <div class="gks-stat"><span class="gks-stat__label">Түр зогссон</span><span class="gks-stat__value gks-tnum">{{ report.attrition.onHold }}</span></div>
      <div class="gks-stat"><span class="gks-stat__label">Цуцлагдсан</span><span class="gks-stat__value gks-tnum">{{ report.attrition.cancelled }}</span></div>
      <div class="gks-stat"><span class="gks-stat__label">Татгалзсан</span><span class="gks-stat__value gks-tnum">{{ report.attrition.rejected }}</span></div>
    </div>

    <div v-if="report.attrition.reasons.length" class="gks-reports__section">
      <ReportsBarList
        :rows="report.attrition.reasons.map((row, index) => ({
          key: `${index}-${row.reason}`,
          label: row.reason,
          value: row.count,
          tone: 'danger',
        }))"
      />
    </div>
    <p v-else class="gks-reports__note">Энэ хугацаанд цуцлалтын шалтгаан тэмдэглэгдээгүй.</p>
  </DsCard>
</template>
