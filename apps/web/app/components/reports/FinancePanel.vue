<script setup lang="ts">
import type { FinanceReport } from '@gks/shared';

/**
 * The money report.
 *
 * The layout carries one argument: **income and pass-through money are not the
 * same thing**. Tuition a client sends to a Korean school through our account
 * never enters the income card — it has its own, headed "орлого биш" — because
 * adding the two made GKS look several times larger than it is, and the office
 * plans against this figure.
 */
defineProps<{ report: FinanceReport; download: (report: string) => void }>();

const mnt = (value: number) => formatMnt(value) ?? '0₮';
</script>

<template>
  <DsCard :title="`Зуучлалын орлого · ${report.period.labelMn}`" eyebrow="GKS-ийн өөрийн орлого">
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('income')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <div class="gks-stats">
      <div class="gks-stat gks-stat--success">
        <span class="gks-stat__label">Цэвэр орлого</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.income.netMnt) }}</span>
        <span class="gks-stat__foot">
          Өмнөх үе: {{ mnt(report.income.previousNetMnt) }}
          <template v-if="report.income.changePercent !== null">
            ({{ report.income.changePercent > 0 ? '+' : '' }}{{ report.income.changePercent }}%)
          </template>
        </span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Урьдчилгаа</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.income.prepaymentMnt) }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Үлдэгдэл төлбөр</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.income.balanceMnt) }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Шилжүүлгийн шимтгэл</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.income.transferFeeMnt) }}</span>
        <span class="gks-stat__foot">Сургуулийн нэхэмжлэхээс</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Нэмэлт үйлчилгээ</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.income.extraServiceMnt) }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--warn': report.income.refundMnt > 0 }">
        <span class="gks-stat__label">Буцаалт</span>
        <span class="gks-stat__value gks-tnum">−{{ mnt(report.income.refundMnt) }}</span>
      </div>
    </div>
  </DsCard>

  <DsCard title="Дамжин өнгөрөх мөнгө" eyebrow="Орлого биш — сургуулийн төлбөр">
    <p class="gks-reports__note">
      Үйлчлүүлэгчийн сургуульдаа шилжүүлсэн төлбөр манай данснаас дамжина. Энэ нь GKS-ийн орлого
      биш тул дээрх тоонд хэзээ ч нэмэгдэхгүй; манайх нь зөвхөн шилжүүлгийн шимтгэл.
    </p>
    <div class="gks-stats">
      <div class="gks-stat">
        <span class="gks-stat__label">Нэхэмжлэх</span>
        <span class="gks-stat__value gks-tnum">{{ report.passThrough.invoiceCount }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Хураасан</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.passThrough.collectedMnt) }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--warn': report.passThrough.awaitingSchoolMnt > 0 }">
        <span class="gks-stat__label">Сургууль хүлээж аваагүй</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.passThrough.awaitingSchoolMnt) }}</span>
      </div>
    </div>
  </DsCard>

  <DsCard title="Авлага" eyebrow="Одоогийн байдлаар, шөнийн тоо биш">
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('receivables')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <div class="gks-stats">
      <div class="gks-stat">
        <span class="gks-stat__label">Нийт авлага</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.receivables.totalMnt) }}</span>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--danger': report.receivables.overdueMnt > 0 }">
        <span class="gks-stat__label">Хугацаа хэтэрсэн</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.receivables.overdueMnt) }}</span>
      </div>
      <div class="gks-stat">
        <span class="gks-stat__label">Нэхэмжлээгүй гэрээний үлдэгдэл</span>
        <span class="gks-stat__value gks-tnum">{{ mnt(report.committed.amountMnt) }}</span>
        <span class="gks-stat__foot">{{ report.committed.caseCount }} хэрэг дээр</span>
      </div>
    </div>

    <div class="gks-reports__section">
      <ReportsBarList
        :rows="report.receivables.aging.map((row) => ({
          key: row.bucket,
          label: RECEIVABLE_BUCKET_LABELS[row.bucket],
          value: row.amountMnt,
          tone: row.bucket === 'UPCOMING' ? 'brand' : 'danger',
          note: `${row.count} ш · ${mnt(row.amountMnt)}`,
        }))"
      />
    </div>

    <div v-if="report.receivables.top.length" class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <caption class="gks-table__caption">Хамгийн эрт болсон авлага</caption>
        <thead>
          <tr>
            <th scope="col">Хэрэг</th>
            <th scope="col">Үйлчлүүлэгч</th>
            <th scope="col">Зөвлөх</th>
            <th scope="col">Төрөл</th>
            <th scope="col" class="gks-table__num">Дүн</th>
            <th scope="col">Төлөх огноо</th>
            <th scope="col" class="gks-table__num">Хэтэрсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.receivables.top" :key="row.paymentId">
            <td><NuxtLink :to="`/admin/cases/${row.caseId}`">{{ row.caseCode }}</NuxtLink></td>
            <td>{{ row.clientName ?? '—' }}</td>
            <td>{{ row.consultantName ?? '—' }}</td>
            <td>{{ PAYMENT_KIND_LABELS[row.kind] }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.amountMnt) }}</td>
            <td class="gks-tnum">{{ formatNumericDateLocal(row.dueAt) }}</td>
            <td class="gks-table__num gks-tnum" :class="{ 'gks-table__num--warn': row.daysOverdue > 0 }">
              {{ row.daysOverdue > 0 ? `${row.daysOverdue} хоног` : '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="gks-reports__note">Хүлээгдэж буй төлбөр алга.</p>
  </DsCard>

  <div class="gks-reports__pair">
    <DsCard title="Үйлчилгээгээр">
      <div class="gks-table-wrap gks-table-wrap--auto">
        <table class="gks-table">
          <thead>
            <tr>
              <th scope="col">Үйлчилгээ</th>
              <th scope="col" class="gks-table__num">Цэвэр орлого</th>
              <th scope="col" class="gks-table__num">Өмнөх үе</th>
              <th scope="col" class="gks-table__num">Хэрэг</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in report.byService" :key="row.serviceType">
              <td>{{ SERVICE_LABELS[row.serviceType] }}</td>
              <td class="gks-table__num gks-tnum">{{ mnt(row.netMnt) }}</td>
              <td class="gks-table__num gks-tnum">
                {{ mnt(row.previousMnt) }}
                <template v-if="row.changePercent !== null">
                  ({{ row.changePercent > 0 ? '+' : '' }}{{ row.changePercent }}%)
                </template>
              </td>
              <td class="gks-table__num gks-tnum">{{ row.caseCount }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!report.byService.length" class="gks-reports__note">Энэ хугацаанд орлого алга.</p>
    </DsCard>

    <DsCard title="Ямар сувгаар төлсөн бэ">
      <ReportsBarList
        :rows="report.byMethod.map((row) => ({
          key: row.method,
          label: PAYMENT_METHOD_LABELS[row.method],
          value: row.amountMnt,
          note: `${row.count} ш · ${mnt(row.amountMnt)}`,
        }))"
        empty-text="Төлбөр бүртгэгдээгүй."
      />
    </DsCard>
  </div>

  <DsCard title="Сараар" eyebrow="Орлого ба дамжин өнгөрсөн мөнгө тусад нь">
    <div class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col">Сар</th>
            <th scope="col" class="gks-table__num">Урьдчилгаа</th>
            <th scope="col" class="gks-table__num">Үлдэгдэл</th>
            <th scope="col" class="gks-table__num">Бусад</th>
            <th scope="col" class="gks-table__num">Буцаалт</th>
            <th scope="col" class="gks-table__num">Цэвэр орлого</th>
            <th scope="col" class="gks-table__num">Дамжин өнгөрсөн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.byMonth" :key="row.month">
            <td class="gks-tnum">{{ formatReportMonth(row.month) }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.prepaymentMnt) }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.balanceMnt) }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.otherMnt) }}</td>
            <td class="gks-table__num gks-tnum">{{ row.refundMnt ? `−${mnt(row.refundMnt)}` : '—' }}</td>
            <td class="gks-table__num gks-tnum"><strong>{{ mnt(row.netMnt) }}</strong></td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.passThroughMnt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!report.byMonth.length" class="gks-reports__note">Энэ хугацаанд гүйлгээ алга.</p>
  </DsCard>
</template>
