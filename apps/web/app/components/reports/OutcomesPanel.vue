<script setup lang="ts">
import type { OutcomesReport } from '@gks/shared';

/**
 * Did it work?
 *
 * For a brokerage the admission rate and the visa rate *are* the product — the
 * client is buying odds. The old dashboard counted only the wins, which makes a
 * rate impossible to compute and a weak school impossible to see; both sides
 * are counted here, and a rate nobody has evidence for reads as "—", never 0%.
 */
defineProps<{ report: OutcomesReport; download: (report: string) => void }>();

const APPLICATION_DECISION_LABELS: Record<string, string> = {
  PASSED: 'Тэнцсэн',
  FAILED: 'Тэнцээгүй',
  WAITLISTED: 'Хүлээлгийн жагсаалтад',
  DEFERRED: 'Хойшлуулсан',
};
</script>

<template>
  <DsCard :title="`Элсэлтийн үр дүн · ${report.period.labelMn}`">
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('outcomes')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <div class="gks-stats">
      <div class="gks-stat">
        <span class="gks-stat__label">Мэдүүлсэн</span>
        <span class="gks-stat__value gks-tnum">{{ report.applications.submitted }}</span>
      </div>
      <div class="gks-stat gks-stat--success">
        <span class="gks-stat__label">Тэнцсэн</span>
        <span class="gks-stat__value gks-tnum">{{ report.applications.accepted }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--danger': report.applications.rejected > 0 }">
        <span class="gks-stat__label">Татгалзсан</span>
        <span class="gks-stat__value gks-tnum">{{ report.applications.rejected }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Хариу хүлээж буй</span>
        <span class="gks-stat__value gks-tnum">{{ report.applications.pending }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Амжилтын хувь</span>
        <span class="gks-stat__value gks-tnum">{{ formatRate(report.applications.successRate) }}</span>
        <span class="gks-stat__foot">Өмнөх үе: {{ formatRate(report.applications.previousSuccessRate) }}</span>
      </div>
    </div>
  </DsCard>

  <DsCard title="Сургууль тус бүрээр" eyebrow="§19 — мэдүүлгийн тоо ба үр дүн">
    <div v-if="report.byUniversity.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Сургууль</th>
            <th scope="col" class="gks-table__num">Мэдүүлсэн</th>
            <th scope="col" class="gks-table__num">Тэнцсэн</th>
            <th scope="col" class="gks-table__num">Татгалзсан</th>
            <th scope="col" class="gks-table__num">Хүлээгдэж буй</th>
            <th scope="col" class="gks-table__num">Амжилт</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.byUniversity" :key="row.universityId ?? row.nameMn">
            <td>
              {{ row.nameMn }}
              <span v-if="row.nameKo" class="gks-reports__sub">{{ row.nameKo }}</span>
            </td>
            <td class="gks-table__num gks-tnum">{{ row.submitted }}</td>
            <td class="gks-table__num gks-tnum">{{ row.accepted }}</td>
            <td class="gks-table__num gks-tnum">{{ row.rejected }}</td>
            <td class="gks-table__num gks-tnum">{{ row.pending }}</td>
            <td class="gks-table__num gks-tnum">{{ formatRate(row.successRate) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Энэ хугацаанд мэдүүлэг бүртгэгдээгүй.</p>
  </DsCard>

  <div class="gks-reports__pair">
    <DsCard title="Үйлчилгээгээр">
      <div v-if="report.byService.length" class="gks-table-wrap gks-table-wrap--auto">
        <table class="gks-table">
          <thead>
            <tr>
              <th scope="col">Үйлчилгээ</th>
              <th scope="col" class="gks-table__num">Мэдүүлсэн</th>
              <th scope="col" class="gks-table__num">Тэнцсэн</th>
              <th scope="col" class="gks-table__num">Амжилт</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.byService" :key="row.serviceType">
              <td>{{ SERVICE_LABELS[row.serviceType] }}</td>
              <td class="gks-table__num gks-tnum">{{ row.submitted }}</td>
              <td class="gks-table__num gks-tnum">{{ row.accepted }}</td>
              <td class="gks-table__num gks-tnum">{{ formatRate(row.successRate) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="gks-reports__note">Мэдээлэл алга.</p>
    </DsCard>

    <DsCard title="GKS-ийн шатууд" eyebrow="Тэтгэлэг хоёр шаттай (§7)">
      <div v-if="report.gksRounds.length" class="gks-reports__rounds">
        <div v-for="round in report.gksRounds" :key="round.round">
          <p class="gks-reports__round-title">{{ round.round }}-р шат</p>
          <ReportsBarList
            :rows="round.counts.map((entry) => ({
              key: `${round.round}-${entry.decision}`,
              label: APPLICATION_DECISION_LABELS[entry.decision] ?? entry.decision,
              value: entry.count,
              tone: entry.decision === 'FAILED' ? 'danger' : 'brand',
            }))"
          />
        </div>
      </div>
      <p v-else class="gks-reports__note">Энэ хугацаанд шатны шийдвэр бүртгэгдээгүй.</p>
    </DsCard>
  </div>

  <DsCard title="Виз" eyebrow="§19 — гарсан болон татгалзсан">
    <div class="gks-stats">
      <div class="gks-stat gks-stat--success">
        <span class="gks-stat__label">Виз гарсан</span>
        <span class="gks-stat__value gks-tnum">{{ report.visa.approved }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--danger': report.visa.rejected > 0 }">
        <span class="gks-stat__label">Татгалзсан</span>
        <span class="gks-stat__value gks-tnum">{{ report.visa.rejected }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Явцад байгаа</span>
        <span class="gks-stat__value gks-tnum">{{ report.visa.pending }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Зөвшөөрлийн хувь</span>
        <span class="gks-stat__value gks-tnum">{{ formatRate(report.visa.approvalRate) }}</span>
        <span class="gks-stat__foot">Өмнөх үе: {{ formatRate(report.visa.previousApprovalRate) }}</span>
      </div>
    </div>

    <div v-if="report.visa.byType.length" class="gks-reports__section">
      <ReportsBarList
        :rows="report.visa.byType.map((row) => ({
          key: row.visaType,
          label: VISA_TYPE_LABELS[row.visaType],
          value: row.approved + row.rejected,
          note: `${row.approved} гарсан · ${row.rejected} татгалзсан · ${row.pending} явцад`,
        }))"
      />
    </div>

    <div v-if="report.visa.rejections.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <caption class="gks-table__caption">Татгалзсан визүүд ба шалтгаан</caption>
        <thead>
          <tr>
            <th scope="col">Хэрэг</th>
            <th scope="col">Үйлчлүүлэгч</th>
            <th scope="col">Төрөл</th>
            <th scope="col">Огноо</th>
            <th scope="col">Шалтгаан</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.visa.rejections" :key="row.caseId">
            <td><NuxtLink :to="`/admin/cases/${row.caseId}`">{{ row.caseCode }}</NuxtLink></td>
            <td>{{ row.clientName ?? '—' }}</td>
            <td>{{ VISA_TYPE_LABELS[row.visaType] }}</td>
            <td class="gks-tnum">{{ formatNumericDateLocal(row.decidedAt) }}</td>
            <td>{{ row.reason ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-reports__rounds { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-reports__round-title { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); margin-bottom: var(--sp-2); }
</style>
