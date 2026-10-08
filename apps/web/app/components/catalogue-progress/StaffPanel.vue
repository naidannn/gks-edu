<script setup lang="ts">
import type { CatalogueProgress } from '@gks/shared';

/** 1A-43 — who on the team filled the catalogue in, over the chosen period. */
defineProps<{ progress: CatalogueProgress }>();
const periodDays = defineModel<string>('periodDays', { required: true });

const PERIOD_OPTIONS = [
  { value: '7', label: 'Сүүлийн 7 хоног' },
  { value: '30', label: 'Сүүлийн 30 хоног' },
  { value: '90', label: 'Сүүлийн 90 хоног' },
  { value: '365', label: 'Сүүлийн 1 жил' },
];
</script>

<template>
  <div class="cp-panel">
    <div class="cp-toolbar">
      <DsSelect v-model="periodDays" :options="PERIOD_OPTIONS" aria-label="Хугацаа" />
    </div>

    <DsCard v-if="!progress.staff.length">Энэ хугацаанд каталог дээр ажилласан бүртгэл алга.</DsCard>
    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr>
            <th>Ажилтан</th>
            <th class="gks-table__num">Сургууль</th>
            <th class="gks-table__num">Элсэлт нэмсэн / зассан</th>
            <th class="gks-table__num">Анги нэмсэн / зассан</th>
            <th class="gks-table__num">Танхим</th>
            <th class="gks-table__num">Хянасан</th>
            <th class="gks-table__num">AI судалгаа</th>
            <th>Сүүлд</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="member in progress.staff" :key="member.actorId ?? member.name">
            <td data-label="Ажилтан">
              <span class="gks-cell-name">{{ member.name }}</span>
              <span v-if="member.email && member.email !== member.name" class="gks-cell-sub">{{ member.email }}</span>
            </td>
            <td class="gks-table__num gks-tnum cp-strong" data-label="Сургууль">{{ member.schoolsTouched }}</td>
            <td class="gks-table__num gks-tnum" data-label="Элсэлт нэмсэн / зассан">
              {{ member.intakesCreated || '—' }} / {{ member.intakesUpdated || '—' }}
            </td>
            <td class="gks-table__num gks-tnum" data-label="Анги нэмсэн / зассан">
              {{ member.programsCreated || '—' }} / {{ member.programsUpdated || '—' }}
            </td>
            <td class="gks-table__num gks-tnum" data-label="Танхим">{{ member.facultiesChanged || '—' }}</td>
            <td class="gks-table__num gks-tnum" data-label="Хянасан">{{ member.verified || '—' }}</td>
            <td class="gks-table__num gks-tnum" data-label="AI судалгаа">{{ member.researchRuns || '—' }}</td>
            <td class="gks-tnum" data-label="Сүүлд">{{ member.lastActiveAt ? formatRelativeMn(member.lastActiveAt) : '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <DsCard v-if="progress.recent.length" :title="`Сүүлийн ${progress.recent.length} үйлдэл`">
      <ul class="cp-recent">
        <li v-for="entry in progress.recent" :key="entry.id">
          <span class="gks-tnum gks-muted">{{ formatDateTime(entry.at) }}</span>
          <strong>{{ entry.actorName }}</strong>
          <NuxtLink v-if="entry.university" :to="`/admin/universities/${entry.university.id}`">
            {{ entry.university.nameMn }}
          </NuxtLink>
          <span v-else class="gks-muted">(сургууль тодорхойгүй)</span>
          — {{ CATALOGUE_ACTION_LABELS[entry.action] ?? entry.action }}<template v-if="entry.count > 1"> ({{ entry.count }})</template>
        </li>
      </ul>
    </DsCard>
  </div>
</template>

<style scoped>
.cp-panel { display: flex; flex-direction: column; gap: var(--sp-4); }
.cp-toolbar { display: flex; justify-content: flex-end; }
.cp-strong { font-weight: var(--fw-semibold); color: var(--text-strong); }
.cp-recent { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.cp-recent li { display: flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; }
</style>
