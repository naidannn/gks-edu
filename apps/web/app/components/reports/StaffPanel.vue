<script setup lang="ts">
import type { StaffReport } from '@gks/shared';

/**
 * Who did what, in the chosen period.
 *
 * The columns are grouped because the two halves answer different questions:
 * everything under **Энэ хугацаанд** is work done inside the window; everything
 * under **Одоо** is the load the person is carrying right now. The old version
 * mixed them into one ever-growing tally that told a manager nothing about this
 * month.
 */
defineProps<{ report: StaffReport; download: (report: string) => void }>();

const mnt = (value: number) => formatMnt(value) ?? '0₮';
</script>

<template>
  <DsCard :title="`Ажилтны гүйцэтгэл · ${report.period.labelMn}`">
    <template #action>
      <button type="button" class="gks-reports__download" @click="download('staff')">
        <DsIcon name="download" :size="14" /> CSV
        </button>
    </template>

    <div class="gks-table-wrap gks-table-wrap--auto">
      <table class="gks-table">
        <thead>
          <tr>
            <th scope="col" rowspan="2">Ажилтан</th>
            <th scope="colgroup" colspan="6" class="gks-reports__group">Энэ хугацаанд</th>
            <th scope="colgroup" colspan="3" class="gks-reports__group">Одоо</th>
          </tr>
          <tr>
            <th scope="col" class="gks-table__num">Сэжим</th>
            <th scope="col" class="gks-table__num">Гэрээ болсон</th>
            <th scope="col" class="gks-table__num">Хөрвөлт</th>
            <th scope="col" class="gks-table__num">Гэрээний дүн</th>
            <th scope="col" class="gks-table__num">Хураасан</th>
            <th scope="col" class="gks-table__num">Дуусгасан ажил</th>
            <th scope="col" class="gks-table__num">Идэвхтэй хэрэг</th>
            <th scope="col" class="gks-table__num">Нээлттэй ажил</th>
            <th scope="col" class="gks-table__num">Хэтэрсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in report.rows" :key="row.staffId">
            <td>
              {{ row.name ?? row.email }}
              <span class="gks-reports__sub">{{ ROLE_LABELS[row.role] ?? row.role }}</span>
            </td>
            <td class="gks-table__num gks-tnum">{{ row.leadsAssigned }}</td>
            <td class="gks-table__num gks-tnum">{{ row.leadsWon }}</td>
            <td class="gks-table__num gks-tnum">{{ formatRate(row.conversionRate) }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.contractValueMnt) }}</td>
            <td class="gks-table__num gks-tnum">{{ mnt(row.collectedMnt) }}</td>
            <td class="gks-table__num gks-tnum">{{ row.tasksCompleted }}</td>
            <td class="gks-table__num gks-tnum">{{ row.activeCases }}</td>
            <td class="gks-table__num gks-tnum">{{ row.openTasks }}</td>
            <td class="gks-table__num gks-tnum" :class="{ 'gks-table__num--warn': row.overdueTasks > 0 }">
              {{ row.overdueTasks }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="!report.rows.length" class="gks-reports__note">Идэвхтэй ажилтан алга.</p>

    <p class="gks-reports__note">
      Хураасан төлбөрт зөвхөн GKS-ийн орлого ордог — сургууль руу дамжсан сургалтын төлбөр
      хэний ч гүйцэтгэлд тооцогдохгүй. Хөрвөлт нь тухайн хугацаанд хаасан сэжмээс гэрээ
      болсны хувь.
    </p>
  </DsCard>
</template>

<style scoped>
.gks-reports__group { text-align: center; font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
</style>
