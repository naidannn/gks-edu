<script setup lang="ts">
/**
 * The client's home screen (1G-15): where their case stands, the one thing to
 * do next, and — when there is no case yet — the way to start one.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });
useHead({ title: 'Миний булан' });

const { overview, pending, error, load, activeCase } = usePortal();

onMounted(() => load());

const profile = computed(() => overview.value?.profile ?? null);
const otherCases = computed(() =>
  (overview.value?.cases ?? []).filter((row) => row.id !== overview.value?.activeCaseId),
);

const TAB_LINKS = [
  { tab: 'contract', label: 'Гэрээ', icon: 'file-text' },
  { tab: 'payment', label: 'Төлбөр', icon: 'credit-card' },
  { tab: 'documents', label: 'Материал', icon: 'folder-open' },
  { tab: 'application', label: 'Мэдүүлэг', icon: 'graduation-cap' },
  { tab: 'visa', label: 'Виз', icon: 'plane' },
  { tab: 'departure', label: 'Бэлтгэл', icon: 'luggage' },
];
</script>

<template>
  <div class="gks-home">
    <header class="gks-home__head">
      <div>
        <span class="gks-eyebrow">Миний булан</span>
        <h1 class="gks-home__title">
          Сайн байна уу{{ profile?.fullName ? `, ${profile.fullName}` : '' }}
        </h1>
      </div>
      <DsBadge v-if="profile?.code" tone="neutral">{{ profile.code }}</DsBadge>
    </header>

    <DsCard v-if="error" accent><p>{{ error }}</p></DsCard>
    <div v-else-if="pending && !overview" class="gks-home__skeleton" />

    <template v-else-if="overview">
      <!-- The contract is written against this data, so it comes before anything else. -->
      <DsCard v-if="!profile?.isComplete" accent title="Хувийн мэдээллээ гүйцээнэ үү">
        <p class="gks-home__lede">
          Зуучлалын гэрээ таны нэр, регистрийн дугаар дээр бичигдэнэ. Дараах мэдээлэл дутуу байна:
        </p>
        <ul class="gks-home__missing">
          <li v-for="field in profile?.missing ?? []" :key="field.field">
            <DsIcon name="circle-alert" :size="14" /> {{ field.label }}
          </li>
        </ul>
        <DsButton variant="accent" icon-right="arrow-right" class="gks-home__cta" @click="navigateTo('/app/profile')">
          Мэдээллээ бөглөх
        </DsButton>
      </DsCard>

      <template v-if="activeCase">
        <PortalNextActionCard :action="activeCase.nextAction" :case-id="activeCase.id" />

        <DsCard :title="`${activeCase.code} · ${SERVICE_LABELS[activeCase.serviceType]}`">
          <template #action>
            <NuxtLink :to="`/app/cases/${activeCase.id}`" class="gks-home__link">Дэлгэрэнгүй</NuxtLink>
          </template>

          <PortalJourneyStepper :journey="activeCase.journey" :stage="activeCase.stage" />

          <nav class="gks-home__tabs" aria-label="Үйлчилгээний хэсгүүд">
            <NuxtLink
              v-for="tab in TAB_LINKS"
              :key="tab.tab"
              :to="`/app/cases/${activeCase.id}/${tab.tab}`"
              class="gks-home__tab"
            >
              <DsIcon :name="tab.icon" :size="16" />
              <span>{{ tab.label }}</span>
            </NuxtLink>
          </nav>
        </DsCard>
      </template>

      <DsCard v-else title="Танд идэвхтэй үйлчилгээ алга байна">
        <p class="gks-home__lede">
          Үйлчилгээгээ сонгоод зуучлалын гэрээгээ энд байгуулж, урьдчилгаа төлбөрөө QPay-ээр төлснөөр
          материал бүрдүүлэлт эхэлнэ.
        </p>
        <DsButton variant="accent" icon-right="arrow-right" class="gks-home__cta" @click="navigateTo('/app/start')">
          Үйлчилгээ эхлүүлэх
        </DsButton>
      </DsCard>

      <section v-if="otherCases.length" class="gks-home__others">
        <h2 class="gks-home__section-title">Бусад үйлчилгээ</h2>
        <PortalCaseCard v-for="item in otherCases" :key="item.id" :item="item" />
      </section>

      <DsCard title="Тусламж хэрэгтэй юу?">
        <p class="gks-home__lede">
          Асуулт гарвал зөвлөхтэйгээ холбогдоорой: <a :href="`tel:${COMPANY.phone}`" class="gks-tnum">{{ COMPANY.phoneLabel }}</a>.
          Түгээмэл асуултын хариуг <NuxtLink to="/faq">энд</NuxtLink> уншиж болно.
        </p>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-home { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-home__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
.gks-home__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-home__skeleton { height: 220px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }

.gks-home__lede { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-home__missing { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); margin-top: var(--sp-3); list-style: none; }
.gks-home__missing li { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-home__cta { margin-top: var(--sp-4); }
.gks-home__link { font-size: var(--fs-body-sm); color: var(--brand-600); text-decoration: none; }

.gks-home__tabs { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-5); }
.gks-home__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-2);
  border: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
  font-size: var(--fs-body-sm);
  color: var(--text-body);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-home__tab:hover { border-color: var(--brand-300); color: var(--brand-700); }

.gks-home__others { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-home__section-title { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
</style>
