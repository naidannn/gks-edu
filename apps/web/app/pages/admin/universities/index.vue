<script setup lang="ts">
import type {
  AdminUniversityRow,
  AdminUniversityStats,
  AgentContractStatus,
  ProgramLevel,
  UniversityRegionOption,
  UniversityType,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Staff catalogue (1A-25). The public `/universities` page only ever shows
 * published schools; this one leads with the drafts, because "which schools are
 * still missing their write-up" is the question the office actually has.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = {
  items: AdminUniversityRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const auth = useAuthStore();
const api = useApi();

const TYPE_OPTIONS: { value: UniversityType | ''; label: string }[] = [
  { value: '', label: 'Бүх төрөл' },
  ...(Object.entries(UNIVERSITY_TYPE_LABELS) as [UniversityType, string][]).map(([value, label]) => ({ value, label })),
];
const LEVEL_OPTIONS: { value: ProgramLevel | ''; label: string }[] = [
  { value: '', label: 'Бүх түвшин' },
  ...(Object.entries(PROGRAM_LEVEL_LABELS) as [ProgramLevel, string][]).map(([value, label]) => ({ value, label })),
];
const AGENT_OPTIONS: { value: AgentContractStatus | ''; label: string }[] = [
  { value: '', label: 'Агентын гэрээ: бүгд' },
  ...(Object.entries(AGENT_CONTRACT_STATUS_LABELS) as [AgentContractStatus, string][]).map(([value, label]) => ({ value, label })),
];
const SORT_OPTIONS = [
  { value: 'gks', label: 'GKS эрэмбээр' },
  { value: 'rank', label: 'THE рэйтингээр' },
  { value: 'name', label: 'Нэрээр (А–Я)' },
  { value: 'city', label: 'Хотоор' },
  { value: 'students', label: 'Оюутны тоогоор' },
  { value: 'founded', label: 'Байгуулагдсан оноор' },
  { value: 'updated', label: 'Сүүлд өөрчилсөн' },
];

const q = ref('');
const region = ref('');
const type = ref<UniversityType | ''>('');
const level = ref<ProgramLevel | ''>('');
const agentContractStatus = ref<AgentContractStatus | ''>('');
const publishFilter = ref<'all' | 'published' | 'draft'>('all');
const languagePrep = ref(false);
const gks = ref(false);
const sort = ref('gks');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 25,
  sort: sort.value,
  // Newest-first is what you want from a date column; A–Я from the rest.
  // Newest/biggest first for the date and count columns; #1 first for the two
  // rank columns, where ascending already means "best".
  order: sort.value === 'updated' || sort.value === 'students' ? 'desc' : 'asc',
  ...(q.value ? { q: q.value } : {}),
  ...(region.value ? { region: region.value } : {}),
  ...(type.value ? { type: type.value } : {}),
  ...(level.value ? { level: level.value } : {}),
  ...(agentContractStatus.value ? { agentContractStatus: agentContractStatus.value } : {}),
  ...(publishFilter.value === 'all' ? {} : { published: publishFilter.value === 'published' }),
  ...(languagePrep.value ? { languagePrep: true } : {}),
  ...(gks.value ? { gks: true } : {}),
}));

const data = ref<Paginated | null>(null);
const stats = ref<AdminUniversityStats | null>(null);
const regions = ref<UniversityRegionOption[]>([]);
const pending = ref(true);
const error = ref(false);

const REGION_OPTIONS = computed(() => [
  { value: '', label: 'Бүх бүс' },
  ...regions.value.map((r) => ({ value: r.value, label: `${r.label} (${r.count})` })),
]);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, summary] = await Promise.all([
      api.get<Paginated>('/admin/universities', { query: query.value }),
      api.get<AdminUniversityStats>('/admin/universities/stats'),
    ]);
    data.value = list;
    stats.value = summary;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

onMounted(async () => {
  // The region list never changes between filter runs — fetch it once.
  regions.value = await api.get<UniversityRegionOption[]>('/admin/universities/regions').catch(() => []);
  await load();
});

watch([region, type, level, agentContractStatus, publishFilter, languagePrep, gks, sort], () => {
  page.value = 1;
  load();
});
watch(page, load);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function clearFilters() {
  q.value = '';
  region.value = '';
  type.value = '';
  level.value = '';
  agentContractStatus.value = '';
  publishFilter.value = 'all';
  languagePrep.value = false;
  gks.value = false;
}

const hasFilters = computed(() =>
  Boolean(q.value || region.value || type.value || level.value || agentContractStatus.value)
  || publishFilter.value !== 'all'
  || languagePrep.value
  || gks.value,
);
const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

useHead({ title: 'Сургууль · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-crm__title">Сургууль</h1>
        <p class="gks-crm__hint">Солонгосын их дээд сургуулиудын мэдээлэл — нийтлэгдсэн болон ноорог хамт.</p>
      </div>
      <div class="gks-crm__head-actions">
        <NuxtLink to="/universities" target="_blank" class="gks-crm__site-link">
          <DsIcon name="external-link" :size="16" /> Нийтийн каталог
        </NuxtLink>
        <DsButton
          v-if="auth.isAdmin"
          variant="secondary"
          icon-left="sliders-horizontal"
          @click="navigateTo('/admin/universities/ranking')"
        >
          GKS эрэмбэ
        </DsButton>
        <DsButton v-if="auth.isAdmin" variant="accent" icon-left="plus" @click="navigateTo('/admin/universities/new')">
          Шинэ сургууль
        </DsButton>
      </div>
    </header>

    <section v-if="stats" class="gks-crm__summary" aria-label="Каталогийн тойм">
      <div class="gks-crm__stat"><span>Нийт</span><strong class="gks-tnum">{{ stats.total }}</strong></div>
      <div class="gks-crm__stat"><span>Нийтлэгдсэн</span><strong class="gks-tnum">{{ stats.published }}</strong></div>
      <div class="gks-crm__stat"><span>Ноорог</span><strong class="gks-tnum">{{ stats.draft }}</strong></div>
      <div class="gks-crm__stat"><span>Хэлний бэлтгэлтэй</span><strong class="gks-tnum">{{ stats.languagePrep }}</strong></div>
      <div class="gks-crm__stat"><span>GKS-д тэнцэх</span><strong class="gks-tnum">{{ stats.gks }}</strong></div>
      <div class="gks-crm__stat gks-crm__stat--warn">
        <span>Танилцуулга дутуу</span><strong class="gks-tnum">{{ stats.missingIntro }}</strong>
      </div>
    </section>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Нэр, хот, slug-аар хайх…" />
        <DsSelect v-model="region" :options="REGION_OPTIONS" aria-label="Бүс" />
        <DsSelect v-model="type" :options="TYPE_OPTIONS" aria-label="Төрөл" />
        <DsSelect v-model="level" :options="LEVEL_OPTIONS" aria-label="Боловсролын түвшин" />
        <DsSelect v-model="agentContractStatus" :options="AGENT_OPTIONS" aria-label="Агентын гэрээ" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-crm__toggles">
        <DsTag :selected="publishFilter === 'all'" clickable @click="publishFilter = 'all'">Бүгд</DsTag>
        <DsTag :selected="publishFilter === 'published'" clickable @click="publishFilter = 'published'">Нийтлэгдсэн</DsTag>
        <DsTag :selected="publishFilter === 'draft'" clickable @click="publishFilter = 'draft'">Ноорог</DsTag>
        <span class="gks-crm__toggle-sep" aria-hidden="true" />
        <DsTag :selected="languagePrep" clickable @click="languagePrep = !languagePrep">Хэлний бэлтгэлтэй</DsTag>
        <DsTag :selected="gks" clickable @click="gks = !gks">GKS</DsTag>
        <DsButton v-if="hasFilters" variant="ghost" size="sm" icon-left="x" @click="clearFilters">Шүүлтүүр цэвэрлэх</DsButton>
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Сургуулийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>

    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 8" :key="n" class="gks-crm__skeleton-row" />
    </div>

    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-crm__empty">
        {{ hasFilters ? 'Тохирох сургууль олдсонгүй.' : 'Каталог хоосон байна.' }}
      </p>
    </DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr>
            <th class="gks-table__num">GKS</th>
            <th class="gks-table__num">THE</th>
            <th>Сургууль</th>
            <th>Төрөл</th>
            <th>Байршил</th>
            <th class="gks-table__num">Оюутан</th>
            <th class="gks-table__num">Хөтөлбөр</th>
            <th class="gks-table__num">Элсэлт</th>
            <th>Тэмдэглэгээ</th>
            <th>Агентын гэрээ</th>
            <th>Төлөв</th>
            <th>Шинэчилсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in data.items" :key="u.id" class="gks-crm__row" @click="navigateTo(`/admin/universities/${u.id}`)">
            <td class="gks-tnum gks-table__num">
              <span v-if="u.gksRank" :title="u.gksScore !== null ? `Оноо ${u.gksScore}` : undefined">
                #{{ u.gksRank }}
              </span>
              <span v-else class="gks-crm__muted">—</span>
              <span v-if="u.gksRankBoost" class="gks-crm__boost">
                {{ u.gksRankBoost > 0 ? '+' : '' }}{{ u.gksRankBoost }}
              </span>
            </td>
            <td class="gks-tnum gks-table__num">
              <span v-if="u.theKoreaRank">#{{ u.theKoreaRank }}</span>
              <span v-else class="gks-crm__muted">—</span>
            </td>
            <td>
              <div class="gks-uni__ident">
                <img v-if="u.logoPath" :src="u.logoPath" alt="" class="gks-uni__logo" loading="lazy">
                <span v-else class="gks-uni__logo gks-uni__logo--empty" aria-hidden="true">
                  <DsIcon name="school" :size="16" />
                </span>
                <span>
                  <span class="gks-crm__name">{{ u.nameMn }}</span>
                  <span class="gks-crm__sub">{{ u.nameEn }}</span>
                </span>
              </div>
            </td>
            <td>{{ UNIVERSITY_TYPE_LABELS[u.type] }}</td>
            <td>{{ u.cityMn }}, {{ u.regionMn }}</td>
            <td class="gks-tnum gks-table__num">{{ formatNumber(u.studentsTotal) ?? '—' }}</td>
            <td class="gks-tnum gks-table__num">{{ u._count.programs }}</td>
            <td class="gks-tnum gks-table__num">{{ u._count.intakes }}</td>
            <td>
              <div class="gks-uni__flags">
                <DsBadge v-if="u.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл</DsBadge>
                <DsBadge v-if="u.isGksEligible" tone="accent">GKS</DsBadge>
                <span v-if="!u.acceptsLanguagePrep && !u.isGksEligible" class="gks-crm__muted">—</span>
              </div>
            </td>
            <td>
              <DsBadge :tone="AGENT_CONTRACT_STATUS_TONES[u.agentContractStatus]">
                {{ AGENT_CONTRACT_STATUS_LABELS[u.agentContractStatus] }}
              </DsBadge>
            </td>
            <td>
              <DsBadge :tone="u.isPublished ? 'success' : 'neutral'">
                {{ u.isPublished ? 'Нийтлэгдсэн' : 'Ноорог' }}
              </DsBadge>
            </td>
            <td class="gks-tnum">{{ formatDate(u.updatedAt) }}</td>
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
.gks-crm { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-crm__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.gks-crm__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-crm__hint { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-crm__head-actions { display: flex; align-items: center; gap: var(--sp-4); }
.gks-crm__site-link { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-subtle); text-decoration: none; }
.gks-crm__site-link:hover { color: var(--brand-600); }

.gks-crm__summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-crm__stat {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
}
.gks-crm__stat--warn strong { color: var(--warning-fg); }
.gks-crm__stat span { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-crm__stat strong { font-family: var(--font-display); font-size: var(--fs-h4); }

.gks-crm__filters { display: grid; grid-template-columns: 2fr repeat(5, 1fr); gap: var(--sp-3); }
.gks-crm__toggles { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); flex-wrap: wrap; }
.gks-crm__toggle-sep { width: 1px; height: 20px; background: var(--line-hairline); }

.gks-crm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-crm__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-crm__empty { text-align: center; color: var(--text-muted); }
.gks-crm__muted { color: var(--text-subtle); }
/** A hand-set boost, shown next to the rank it produced. */
.gks-crm__boost {
  display: inline-block;
  margin-left: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
}

.gks-crm__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); background: var(--surface-sunken); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-table__num { text-align: right; }
.gks-crm__row { cursor: pointer; }
.gks-crm__row:hover { background: var(--surface-sunken); }
.gks-crm__name { display: block; font-weight: var(--fw-medium); }
.gks-crm__sub { display: block; font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-uni__ident { display: flex; align-items: center; gap: var(--sp-3); }
.gks-uni__logo { width: 32px; height: 32px; flex: 0 0 auto; object-fit: contain; border-radius: var(--radius-1); background: var(--n-000); }
.gks-uni__logo--empty { display: inline-flex; align-items: center; justify-content: center; color: var(--text-subtle); background: var(--surface-sunken); }
.gks-uni__flags { display: flex; gap: var(--sp-2); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 1200px) {
  .gks-crm__summary { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .gks-crm__filters { grid-template-columns: 1fr 1fr 1fr; }
}
@media (max-width: 900px) {
  .gks-crm__summary { grid-template-columns: 1fr 1fr; }
  .gks-crm__filters { grid-template-columns: 1fr 1fr; }
}
</style>
