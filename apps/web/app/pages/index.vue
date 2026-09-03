<script setup lang="ts">
import type { UniversityCard, UniversityFacets } from '@gks/shared';

/** Public landing page: hero, services, process, figures, CTA (1A-09). */
const { data: facets } = await useApiFetch<UniversityFacets>('/universities/facets');
const { data: featured } = await useApiFetch<{ items: UniversityCard[] }>('/universities', {
  query: { limit: 3, sort: 'students', order: 'desc' },
});

// Dedicated service pages arrive with 1A-10; until then each card opens the
// consultation form with that service pre-selected.
const SERVICES = [
  {
    to: '/consultation?service=LANGUAGE_PREP',
    icon: 'languages',
    title: 'Хэлний бэлтгэл',
    text: 'Солонгос хэлний бэлтгэл ангид элсэх зуучлал. Жилд 4 удаагийн элсэлт — 3, 6, 9, 12 сар.',
  },
  {
    to: '/consultation?service=BACHELOR',
    icon: 'graduation-cap',
    title: 'Бакалавр',
    text: 'Их сургуулийн үндсэн ангид элсэх бүрэн зуучлал: сургууль сонголтоос виз хүртэл.',
  },
  {
    to: '/consultation?service=MASTER',
    icon: 'book-open',
    title: 'Магистр, доктор',
    text: 'Судалгааны чиглэл, профессор сонгох зөвлөгөө, эрдэм шинжилгээний материалын бэлтгэл.',
  },
  {
    to: '/consultation?service=GKS_SCHOLARSHIP',
    icon: 'award',
    title: 'GKS тэтгэлэг',
    text: 'БНСУ-ын Засгийн газрын тэтгэлэгт хөтөлбөрийн мэдүүлэг — 2 шатны шалгаруулалт.',
  },
];

const PROCESS = [
  { title: 'Зөвлөгөө', text: 'Боловсрол, хэлний түвшин, төсвөө тодруулж, тохирох хувилбарыг сонгоно.' },
  { title: 'Гэрээ', text: 'Зуучлалын гэрээг цахимаар байгуулж, урьдчилгаа төлбөрөө төлнө.' },
  { title: 'Материал', text: 'Шаардлагатай бичиг баримтын жагсаалт автоматаар гарч, онлайнаар хянагдана.' },
  { title: 'Мэдүүлэг', text: 'Сургуульд мэдүүлэг илгээж, хариуг хүлээн авна.' },
  { title: 'Урилга', text: 'Сургалтын төлбөр шилжүүлж, албан ёсны урилгыг авна.' },
  { title: 'Виз', text: 'Визний материал бүрдүүлж, элчин сайдын яаманд мэдүүлнэ.' },
  { title: 'Явах бэлтгэл', text: 'Билет, даатгал, байр, тосох үйлчилгээ — чеклистээр хянана.' },
];

useHead({ title: 'Солонгост суралцах зуучлал' });
useSeoMeta({
  description:
    'GKS EDU GROUP — Солонгосын их, дээд сургуульд суралцах зуучлалын үйлчилгээ. Хэлний ' +
    'бэлтгэл, бакалавр, магистр, доктор, GKS тэтгэлэг. 135 сургуулийн мэдээлэл нэг дор.',
  ogTitle: 'GKS EDU GROUP · Солонгост суралцах зуучлал',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-home">
    <section class="gks-hero">
      <div class="gks-hero__text">
        <span class="gks-eyebrow">GKS EDU GROUP</span>
        <h1 class="gks-hero__title">Солонгост суралцах замыг тань нэг системээр</h1>
        <p class="gks-hero__lede">
          Зөвлөгөөнөөс эхлээд гэрээ, төлбөр, материал бүрдүүлэлт, мэдүүлэг, виз, явах бэлтгэл
          хүртэл — бүх алхмаа онлайнаар хянаж, юу дутуу байгааг үргэлж мэдэж явна.
        </p>
        <div class="gks-hero__actions">
          <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo('/consultation')">
            Зөвлөгөө авах
          </DsButton>
          <DsButton variant="secondary" size="lg" @click="navigateTo('/universities')">
            Сургуулиудыг үзэх
          </DsButton>
        </div>
      </div>

      <dl class="gks-hero__stats">
        <div>
          <dt>Сургууль</dt>
          <dd class="gks-tnum">{{ facets?.total ?? 135 }}</dd>
        </div>
        <div>
          <dt>Бүс нутаг</dt>
          <dd class="gks-tnum">{{ facets?.regions.length ?? 17 }}</dd>
        </div>
        <div>
          <dt>Үйлчилгээний чиглэл</dt>
          <dd class="gks-tnum">{{ SERVICES.length }}</dd>
        </div>
      </dl>
    </section>

    <section>
      <h2 class="gks-section__title">Үйлчилгээ</h2>
      <ul class="gks-services">
        <li v-for="service in SERVICES" :key="service.title">
          <NuxtLink :to="service.to" class="gks-service">
            <DsIcon :name="service.icon" :size="24" />
            <h3 class="gks-service__title">{{ service.title }}</h3>
            <p class="gks-service__text">{{ service.text }}</p>
            <span class="gks-service__more">Зөвлөгөө авах <DsIcon name="arrow-right" :size="14" /></span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="gks-section__title">Хэрхэн явагддаг вэ</h2>
      <ol class="gks-process">
        <li v-for="(item, index) in PROCESS" :key="item.title" class="gks-process__step">
          <span class="gks-process__index gks-tnum">{{ String(index + 1).padStart(2, '0') }}</span>
          <h3 class="gks-process__title">{{ item.title }}</h3>
          <p class="gks-process__text">{{ item.text }}</p>
        </li>
      </ol>
    </section>

    <section v-if="featured?.items?.length">
      <div class="gks-section__head">
        <h2 class="gks-section__title">Түгээмэл сонгодог сургуулиуд</h2>
        <NuxtLink to="/universities" class="gks-section__link">
          Бүгдийг үзэх <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
      <ul class="gks-home__grid">
        <li v-for="university in featured.items" :key="university.id">
          <UniversityCard :university="university" />
        </li>
      </ul>
    </section>

    <DsCard accent>
      <div class="gks-cta">
        <div>
          <h2 class="gks-cta__title">Хаанаас эхлэхээ мэдэхгүй байна уу?</h2>
          <p class="gks-cta__text">
            Хүсэлтээ үлдээгээрэй — зөвлөх тань танай боловсрол, хэлний түвшинд тохирох
            сургууль, хугацаа, зардлыг тодорхой хэлж өгнө.
          </p>
        </div>
        <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo('/consultation')">
          Зөвлөгөө авах
        </DsButton>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-home { display: flex; flex-direction: column; gap: var(--sp-10); }

.gks-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--sp-8);
  align-items: center;
  padding-bottom: var(--sp-8);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-hero__title {
  margin-top: var(--sp-3);
  font-family: var(--font-display);
  font-size: var(--fs-display-2);
  font-weight: var(--fw-black);
  line-height: var(--lh-tight);
  letter-spacing: var(--ls-display);
  color: var(--text-strong);
}
.gks-hero__lede {
  margin-top: var(--sp-4);
  max-width: var(--container-prose);
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
  color: var(--text-muted);
}
.gks-hero__actions { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-6); }

.gks-hero__stats {
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-6);
  background: var(--surface-inverse);
  color: var(--text-inverse);
}
.gks-hero__stats dt { font-size: var(--fs-caption); color: var(--n-400); }
.gks-hero__stats dd {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-black);
  font-variant-numeric: var(--num-tabular);
  line-height: 1;
}

.gks-section__head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-4); }
.gks-section__title {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
  margin-bottom: var(--sp-5);
}
.gks-section__head .gks-section__title { margin-bottom: 0; }
.gks-section__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-body-sm);
  color: var(--text-link);
  text-decoration: none;
}
.gks-section__link:hover { color: var(--text-link-hover); }
.gks-section__head + ul { margin-top: var(--sp-5); }

.gks-services { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: var(--sp-4); }
.gks-service {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  height: 100%;
  padding: var(--sp-5);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  color: inherit;
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-service:hover { border-color: var(--line-ink); box-shadow: var(--shadow-raised); }
.gks-service svg { color: var(--red-700); }
.gks-service__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-service__text { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); }
.gks-service__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-accent);
}

.gks-process { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-5); }
.gks-process__step { border-top: var(--border-rail) solid var(--ink-800); padding-top: var(--sp-3); }
.gks-process__index {
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-accent);
}
.gks-process__title { margin-top: var(--sp-1); font-size: var(--fs-body-lg); font-weight: var(--fw-bold); }
.gks-process__text { margin-top: var(--sp-2); font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); }

.gks-home__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-4); }

.gks-cta { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-6); flex-wrap: wrap; }
.gks-cta__title { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); }
.gks-cta__text { margin-top: var(--sp-2); max-width: 60ch; color: var(--text-muted); line-height: var(--lh-body); }

@media (max-width: 900px) {
  .gks-hero { grid-template-columns: minmax(0, 1fr); }
  .gks-hero__title { font-size: var(--fs-h1); }
}
</style>
