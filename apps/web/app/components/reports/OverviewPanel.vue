<script setup lang="ts">
import type { ManagementOverview } from '@gks/shared';

/**
 * The management overview (§19), split the way the business actually reads it.
 *
 * **Урсгал** is what happened in the chosen period, each figure carrying the
 * one before it. **Байдал** is where the business stands right now and takes no
 * period at all — receivables and deadlines are facts about this minute, and
 * putting them under a month heading would be a lie about both.
 */
defineProps<{ report: ManagementOverview; canSeeMoney: boolean }>();

const mnt = (value: number) => formatMnt(value) ?? '0₮';
</script>

<template>
  <DsCard :title="`Урсгал · ${report.period.labelMn}`" eyebrow="Энэ хугацаанд юу болов">
    <div class="gks-stats">
      <ReportsMetricTile label="Шинэ хүсэлт" :metric="report.flow.newLeads" />
      <ReportsMetricTile label="Шинэ үйлчлүүлэгч" :metric="report.flow.newClients" />
      <ReportsMetricTile label="Байгуулсан гэрээ" :metric="report.flow.signedContracts" />
      <ReportsMetricTile v-if="canSeeMoney" label="Гэрээний дүн" :metric="report.flow.contractValueMnt" :format="mnt" />
      <ReportsMetricTile v-if="canSeeMoney" label="Цэвэр орлого" :metric="report.flow.netIncomeMnt" :format="mnt" />
      <ReportsMetricTile
        v-if="canSeeMoney"
        label="Буцаалт"
        :metric="report.flow.refundedMnt"
        :format="mnt"
        :higher-is-better="false"
      />
      <ReportsMetricTile label="Сургуульд мэдүүлсэн" :metric="report.flow.applicationsSubmitted" />
      <ReportsMetricTile label="Тэнцсэн" :metric="report.flow.admitted" />
      <ReportsMetricTile label="Виз гарсан" :metric="report.flow.visaApproved" />
      <ReportsMetricTile label="Солонгос руу явсан" :metric="report.flow.departed" />
    </div>
  </DsCard>

  <DsCard title="Одоогийн байдал" eyebrow="Хугацаанаас хамаарахгүй">
    <div class="gks-stats">
      <NuxtLink to="/admin/cases" class="gks-stat">
        <span class="gks-stat__label">Идэвхтэй хэрэг</span>
        <span class="gks-stat__value gks-tnum">{{ report.stock.activeCases }}</span>
      </NuxtLink>
      <NuxtLink to="/admin/consultations" class="gks-stat">
        <span class="gks-stat__label">Нээлттэй хүсэлт</span>
        <span class="gks-stat__value gks-tnum">{{ report.stock.openLeads }}</span>
        <span class="gks-stat__foot">{{ report.stock.unassignedLeads }} нь хариуцагчгүй</span>
      </NuxtLink>
      <NuxtLink v-if="canSeeMoney" to="/admin/payments" class="gks-stat">
        <span class="gks-stat__label">Авлага</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.stock.receivableMnt) }}</span>
      </NuxtLink>
      <NuxtLink
        v-if="canSeeMoney"
        to="/admin/payments"
        class="gks-stat"
        :class="{ 'gks-stat--danger': report.stock.overdueReceivableMnt > 0 }"
      >
        <span class="gks-stat__label">Хугацаа хэтэрсэн авлага</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.stock.overdueReceivableMnt) }}</span>
      </NuxtLink>
      <div v-if="canSeeMoney" class="gks-stat">
        <span class="gks-stat__label">Нэхэмжлээгүй гэрээний үлдэгдэл</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.stock.uninvoicedContractMnt) }}</span>
        <span class="gks-stat__foot">Гэрээгээр батлагдсан, ирээдүйн орлого</span>
      </div>
      <NuxtLink to="/admin/documents" class="gks-stat">
        <span class="gks-stat__label">Материал бүрдүүлж буй</span>
        <span class="gks-stat__value gks-tnum">{{ report.stock.casesCollectingDocuments }}</span>
      </NuxtLink>
      <NuxtLink
        to="/admin/documents"
        class="gks-stat"
        :class="{ 'gks-stat--warn': report.stock.overdueDocuments > 0 }"
      >
        <span class="gks-stat__label">Хугацаа хэтэрсэн материал</span>
        <span class="gks-stat__value gks-tnum">{{ report.stock.overdueDocuments }}</span>
      </NuxtLink>
      <div class="gks-stat" :class="{ 'gks-stat--danger': report.stock.deadlineRiskCases > 0 }">
        <span class="gks-stat__label">Элсэлтэд амжихгүй эрсдэлтэй</span>
        <span class="gks-stat__value gks-tnum">{{ report.stock.deadlineRiskCases }}</span>
        <span class="gks-stat__foot">Дотоод эцсийн хугацаагаар</span>
      </div>
    </div>
  </DsCard>

  <div class="gks-reports__pair">
    <DsCard title="Хэрэг ямар үе шатанд байна" eyebrow="Одоогийн байдлаар">
      <ReportsBarList
        :rows="report.stock.casesByStage.map((row) => ({
          key: row.stage,
          label: CASE_STAGE_LABELS[row.stage],
          value: row.count,
          tone: row.stalledCount > 0 ? 'warning' : 'brand',
          note: `${row.count} · дунджаар ${row.medianDaysInStage} хоног${row.stalledCount ? ` · ${row.stalledCount} гацсан` : ''}`,
        }))"
        empty-text="Идэвхтэй хэрэг алга."
      />
    </DsCard>

    <DsCard title="Хүсэлт хаанаас ирсэн бэ" :eyebrow="report.period.labelMn">
      <ReportsBarList
        :rows="report.leadsBySource.map((row) => ({
          key: row.source,
          label: LEAD_SOURCE_LABELS[row.source],
          value: row.leads,
          note: `${row.leads} → ${row.won} гэрээ (${row.conversionRate}%)`,
        }))"
        empty-text="Энэ хугацаанд хүсэлт ирээгүй байна."
      />
    </DsCard>
  </div>

  <DsCard v-if="canSeeMoney" title="Орлого сараар" eyebrow="Цэвэр, буцаалт хассан">
    <ReportsBarList
      :rows="report.incomeByMonth.map((row) => ({
        key: row.month,
        label: formatReportMonth(row.month),
        value: row.netMnt,
        note: mnt(row.netMnt),
      }))"
      empty-text="Энэ хугацаанд орлого бүртгэгдээгүй."
    />
  </DsCard>
</template>
