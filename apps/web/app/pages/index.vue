<script setup lang="ts">
import type { UniversityCard, UniversityFacets } from '@gks/shared';

/** Public landing page: hero, planner, active admissions, services, trust wall, FAQ, CTA (1A-09). */
const { data: facets } = await useApiFetch<UniversityFacets>('/universities/facets', { lazy: true });
const selectedCity = ref('');
// Our own recommendation order (1A-30) — the same order the catalogue uses, so
// the landing page and the catalogue never disagree about what to show first.
const featuredQuery = computed(() => ({
  limit: 12,
  sort: 'gks',
  order: 'asc',
  ...(selectedCity.value ? { region: selectedCity.value } : {}),
}));

const { data: featuredUniversities, status: featuredStatus } = await useApiFetch<{
  items: UniversityCard[];
  meta: { total: number };
}>('/universities', { query: featuredQuery, lazy: true });
const { data: partnerUniversities } = await useApiFetch<{ items: UniversityCard[] }>('/universities', {
  query: { limit: 30, sort: 'gks', order: 'asc' },
  lazy: true,
});

const featured = computed(() => featuredUniversities.value?.items ?? []);
const trustWall = computed(() =>
  (partnerUniversities.value?.items ?? []).filter((university) => university.logoPath),
);

// South Korea's largest metropolitan cities first; any remaining regions follow
// by the number of universities currently available in the catalogue.
const MAJOR_CITY_ORDER = ['seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'ulsan', 'sejong'];
const cityRank = (value: string) => {
  const normalized = value.toLowerCase();
  const index = MAJOR_CITY_ORDER.findIndex((city) => normalized.includes(city));
  return index === -1 ? Number.POSITIVE_INFINITY : index;
};

const cityOptions = computed(() => [
  { value: '', label: 'Бүгд' },
  ...(facets.value?.regions ?? [])
    .toSorted((a, b) => cityRank(a.value) - cityRank(b.value) || b.count - a.count)
    .map((region) => ({ value: region.value, label: region.label })),
]);
const selectedCityLabel = computed(
  () => cityOptions.value.find((city) => city.value === selectedCity.value)?.label ?? '',
);
const featuredTotal = computed(() => featuredUniversities.value?.meta.total ?? 0);
const remainingUniversities = computed(() => Math.max(featuredTotal.value - featured.value.length, 0));
const universitiesLink = computed(() =>
  selectedCity.value
    ? { path: '/universities', query: { region: selectedCity.value } }
    : { path: '/universities' },
);

const featuredCarousel = ref<HTMLElement | null>(null);
const canScrollFeaturedBack = ref(false);
const canScrollFeaturedForward = ref(false);

function updateFeaturedCarouselControls() {
  const carousel = featuredCarousel.value;
  if (!carousel) return;

  canScrollFeaturedBack.value = carousel.scrollLeft > 4;
  canScrollFeaturedForward.value =
    carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 4;
}

function scrollFeatured(direction: -1 | 1) {
  const carousel = featuredCarousel.value;
  if (!carousel) return;

  carousel.scrollBy({
    left: direction * Math.max(carousel.clientWidth * 0.85, 280),
    behavior: 'smooth',
  });
}

watch([featured, selectedCity], async () => {
  await nextTick();
  featuredCarousel.value?.scrollTo({ left: 0 });
  updateFeaturedCarouselControls();
});

onMounted(() => {
  updateFeaturedCarouselControls();
  window.addEventListener('resize', updateFeaturedCarouselControls);
});
onBeforeUnmount(() => window.removeEventListener('resize', updateFeaturedCarouselControls));

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
    to: '/gks-scholarship',
    icon: 'award',
    title: 'GKS тэтгэлэг',
    text: 'БНСУ-ын Засгийн газрын тэтгэлэгт хөтөлбөрийн мэдүүлэг — 2 шатны шалгаруулалт.',
  },
];

const STATS = computed(() => [
  { icon: 'graduation-cap', value: facets.value?.total ?? 135, label: 'Сургуулийн мэдээлэл' },
  { icon: 'map-pin', value: facets.value?.regions.length ?? 17, label: 'Бүс нутаг' },
  { icon: 'compass', value: SERVICES.length, label: 'Үйлчилгээний чиглэл' },
  { icon: 'calendar-clock', value: 4, label: 'Хэлний ангийн элсэлт /жил' },
]);

// FAQ content sourced from gksedu.md §5.4–§5.5, §9, §6.
const FAQ = [
  {
    q: 'Хэлний бэлтгэл ангид жилд хэдэн удаа элсдэг вэ?',
    a: 'Жилд 4 удаа — 3, 6, 9, 12 сарын элсэлт байдаг. Тохирох улирлыг зөвлөгөөний үед сургууль, хэлний түвшинтэй тань тааруулж сонгоно.',
  },
  {
    q: 'Урьдчилгаа болон үлдэгдэл төлбөрийг хэзээ, яаж төлдөг вэ?',
    a: 'Гэрээ байгуулсны дараа урьдчилгаа төлбөрийг QPay-аар шууд төлнө. Үлдэгдэл төлбөрийн хугацаа үйлчилгээнээс хамаарна: энгийн зуучлалд (хэлний бэлтгэл, бакалавр, магистр, доктор) виз гарсны дараа, харин GKS тэтгэлэгт тэтгэлэгт тэнцсэний дараа буюу виз гарахаас өмнө төлнө.',
  },
  {
    q: 'Барьцааны гэрээ гэж юу вэ, хэнд шаардлагатай вэ?',
    a: 'Зөвхөн энгийн зуучлалын хэлний бэлтгэлд зуучлуулж буй хэрэглэгчид виз гарсны дараа нэмэлт барьцааны гэрээ байгуулна. Энэ бол бэлэн мөнгөний барьцаа биш, харин үл хөдлөх/хөдлөх хөрөнгийг барьцаалсан гэрээ. GKS тэтгэлэг, бакалавр, магистр, докторт барьцааны гэрээ шаардахгүй.',
  },
  {
    q: 'Гэрээг заавал биечлэн ирж байгуулах ёстой юу?',
    a: 'Үгүй. Гэрээг цахимаар эсвэл биет хэлбэрээр байгуулж болно — алийг нь сонгосон ч бүх мэдээлэл системд бүртгэгдэж, дараагийн үе шат нээгдэнэ.',
  },
  {
    q: 'Материал бүрдүүлэлтийн явцаа хэрхэн хардаг вэ?',
    a: 'Сонгосон сургууль, үйлчилгээнд тохирсон материалын жагсаалт автоматаар гарч, материал тус бүр Дутуу → Хүлээгдэж буй → Хянагдаж буй → Батлагдсан → Буцаагдсан төлвөөр онлайнаар харагдана.',
  },
  {
    q: 'Танай сургуулийн мэдээллийн бааз хэр өргөн вэ?',
    a: `Одоогоор ${facets.value?.total ?? 135} сургуулийн мэдээлэл нэг дор бий. Мэдээллийг Wikipedia, Wikidata зэрэг эх сурвалжаас баталгаажуулж бүрдүүлсэн бөгөөд зарим талбар (жишээ нь дотуур байрны үнэ) хараахан шинэчлэгдэж дуусаагүй бол тодорхой тэмдэглэгдсэн байна.`,
  },
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
      <div class="gks-hero__copy">
        <span class="gks-hero__eyebrow">Таны Солонгост сурах зам</span>
        <h1 class="gks-hero__title">
          Солонгост сурах мөрөөдлөөс
          <span class="gks-hero__title-tail">
            <span class="gks-hero__title-accent">бодит төлөвлөгөө</span> рүү 🇰🇷
          </span>
        </h1>
        <p class="gks-hero__lede">
          Танд тохирох сургууль, шаардлагатай материал, хугацаа болон визний бэлтгэлийг
          зөвлөхтэйгөө хамт нэг дор төлөвлө.
        </p>
        <div class="gks-hero__actions">
          <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo('/consultation')">
            Үнэгүй зөвлөгөө авах
          </DsButton>
          <DsButton variant="secondary" size="lg" icon-left="landmark" @click="navigateTo('/universities')">
            Их сургуулиуд үзэх
          </DsButton>
        </div>
      </div>

      <div class="gks-hero__media">
        <img
          src="/img/hero-campus.jpg"
          srcset="/img/hero-campus-900.jpg 900w, /img/hero-campus.jpg 1600w"
          sizes="(max-width: 900px) 100vw, 560px"
          alt="Солонгосын их сургуулийн campus дээр ярилцаж яваа оюутнууд"
          width="1600"
          height="1066"
          fetchpriority="high"
        >
      </div>
    </section>

    <HomeRoadmapTimeline />

    <HomeActiveAdmissions />

    <section>
      <div class="gks-section__head">
        <h2 class="gks-section__title">Түгээмэл сонгодог их сургуулиуд</h2>
        <div class="gks-carousel-controls" aria-label="Сургуулийн carousel удирдлага">
          <DsIconButton
            icon="chevron-left"
            label="Өмнөх сургуулиуд"
            variant="outline"
            size="sm"
            :disabled="!canScrollFeaturedBack"
            @click="scrollFeatured(-1)"
          />
          <DsIconButton
            icon="chevron-right"
            label="Дараагийн сургуулиуд"
            variant="outline"
            size="sm"
            :disabled="!canScrollFeaturedForward"
            @click="scrollFeatured(1)"
          />
        </div>
      </div>
      <div class="gks-city-filter" aria-label="Хотоор шүүх">
        <button
          v-for="city in cityOptions"
          :key="city.value"
          type="button"
          class="gks-city-filter__button"
          :class="{ 'gks-city-filter__button--active': selectedCity === city.value }"
          :aria-pressed="selectedCity === city.value"
          @click="selectedCity = city.value"
        >
          {{ city.label }}
        </button>
      </div>
      <ul
        v-if="featured.length"
        ref="featuredCarousel"
        class="gks-home__carousel"
        @scroll.passive="updateFeaturedCarouselControls"
      >
        <li v-for="university in featured" :key="university.id">
          <UniversityCard
            :university="university"
            name-language="en"
            :show-living-cost="false"
          />
        </li>
      </ul>
      <div v-else-if="featuredStatus === 'pending'" class="gks-home__grid" aria-label="Сургуулиудыг ачаалж байна">
        <div v-for="n in 4" :key="n" class="gks-home__skeleton" />
      </div>
      <p v-else class="gks-home__empty">Энэ хотод бүртгэлтэй сургууль алга байна.</p>
      <div v-if="featuredTotal" class="gks-featured-footer">
        <p>
          <template v-if="selectedCity">{{ selectedCityLabel }} — нийт </template>
          <template v-else>Нийт </template>
          <strong class="gks-tnum">{{ featuredTotal }}</strong> сургууль байна
        </p>
        <NuxtLink :to="universitiesLink" class="gks-section__link">
          <template v-if="remainingUniversities">
            Бусад <span class="gks-tnum">{{ remainingUniversities }}</span> сургуулийг үзэх
          </template>
          <template v-else>Сургуулиудыг үзэх</template>
          <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
    </section>

    <section>
      <h2 class="gks-section__title">Солонгост сурахад хэрэгтэй бүх зүйл нэг дор</h2>
      <ul class="gks-services">
        <li v-for="service in SERVICES" :key="service.title">
          <NuxtLink :to="service.to" class="gks-service">
            <span class="gks-service__icon"><DsIcon :name="service.icon" :size="22" /></span>
            <h3 class="gks-service__title">{{ service.title }}</h3>
            <p class="gks-service__text">{{ service.text }}</p>
            <span class="gks-service__more">Зөвлөгөө авах <DsIcon name="arrow-right" :size="14" /></span>
          </NuxtLink>
        </li>
      </ul>
    </section>

    <dl class="gks-stats">
      <div v-for="stat in STATS" :key="stat.label" class="gks-stats__item">
        <span class="gks-stats__icon"><DsIcon :name="stat.icon" :size="20" /></span>
        <div>
          <dd class="gks-tnum">{{ stat.value }}</dd>
          <dt>{{ stat.label }}</dt>
        </div>
      </div>
    </dl>

    <section v-if="trustWall.length">
      <div class="gks-section__head gks-trust__head">
        <h2 class="gks-section__title">Хамтран ажилладаг сургуулиуд</h2>
        <p class="gks-trust__count">
          Нийт <strong class="gks-tnum">{{ facets?.total ?? trustWall.length }}</strong> сургууль
        </p>
      </div>
      <div class="gks-trust" aria-label="Хамтран ажилладаг сургуулиудын лого">
        <div class="gks-trust__track">
          <ul class="gks-trust__group">
            <li v-for="university in trustWall" :key="university.id">
              <NuxtLink :to="`/universities/${university.slug}`" class="gks-trust__item" :title="university.nameEn">
                <img
                  :src="university.logoPath!"
                  :alt="`${university.nameEn} лого`"
                  loading="lazy"
                  width="80"
                  height="80"
                >
              </NuxtLink>
            </li>
          </ul>
          <ul class="gks-trust__group" aria-hidden="true">
            <li v-for="university in trustWall" :key="`copy-${university.id}`">
              <NuxtLink
                :to="`/universities/${university.slug}`"
                class="gks-trust__item"
                tabindex="-1"
              >
                <img
                  :src="university.logoPath!"
                  alt=""
                  loading="lazy"
                  width="80"
                  height="80"
                >
              </NuxtLink>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section>
      <h2 class="gks-section__title">Түгээмэл асуулт</h2>
      <div class="gks-faq">
        <details v-for="item in FAQ" :key="item.q" class="gks-faq__item">
          <summary>
            {{ item.q }}
            <DsIcon name="chevron-down" :size="18" class="gks-faq__chevron" />
          </summary>
          <p>{{ item.a }}</p>
        </details>
      </div>
    </section>

    <section class="gks-cta">
      <div>
        <h2 class="gks-cta__title">Солонгост сурах таны зам өнөөдрөөс эхэлнэ.</h2>
        <p class="gks-cta__text">
          Хүсэлтээ үлдээгээрэй — зөвлөх тань танай боловсрол, хэлний түвшинд тохирох
          сургууль, хугацаа, зардлыг тодорхой хэлж өгнө.
        </p>
      </div>
      <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo('/consultation')">
        Зөвлөгөө авах
      </DsButton>
    </section>
  </div>
</template>

<style scoped>
.gks-home { display: flex; flex-direction: column; gap: var(--sp-10); }

/* ---- Hero ---- */
.gks-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr);
  align-items: center;
  gap: var(--sp-8);
  border-radius: var(--radius-4);
  background: var(--surface-wash);
  border: var(--border-hair) solid var(--brand-100);
  overflow: hidden;
}
.gks-hero__copy { padding: var(--sp-10) 0 var(--sp-10) var(--sp-9); }
.gks-hero__eyebrow {
  display: inline-block;
  padding: 5px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--brand-100);
  color: var(--brand-700);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
}
.gks-hero__title {
  margin-top: var(--sp-4);
  font-family: var(--font-display);
  font-size: clamp(30px, 3.4vw, 42px);
  font-weight: var(--fw-black);
  line-height: var(--lh-tight);
  letter-spacing: var(--ls-display);
  color: var(--text-strong);
}
.gks-hero__title-tail { white-space: nowrap; }
.gks-hero__title-accent { color: var(--brand-600); }
.gks-hero__lede {
  margin-top: var(--sp-5);
  max-width: 46ch;
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
  color: var(--text-muted);
}
.gks-hero__actions { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-6); }
.gks-hero__media { align-self: stretch; min-height: 380px; position: relative; }
.gks-hero__media img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 60% center;
  /* Feathered left edge so the photo dissolves into the hero wash. */
  -webkit-mask-image: linear-gradient(90deg, transparent 0, rgba(0, 0, 0, .45) 12%, #000 34%);
  mask-image: linear-gradient(90deg, transparent 0, rgba(0, 0, 0, .45) 12%, #000 34%);
}

/* ---- Section furniture ---- */
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
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  text-decoration: none;
  white-space: nowrap;
}
.gks-section__link:hover { color: var(--brand-700); }
.gks-section__head + ul { margin-top: var(--sp-5); }

/* ---- Services ---- */
.gks-services {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.gks-service {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  height: 100%;
  padding: var(--sp-5);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-raised);
  color: inherit;
  text-decoration: none;
  transition: var(--transition-control), box-shadow var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard);
}
.gks-service:hover { border-color: var(--brand-200); box-shadow: var(--shadow-lift); transform: translateY(-2px); }
.gks-service__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-2);
  background: var(--brand-100);
  color: var(--brand-700);
}
.gks-service__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-service__text { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); }
.gks-service__more {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
}

/* ---- Stats ---- */
.gks-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-4);
  margin: 0;
  padding: var(--sp-6);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-raised);
}
.gks-stats__item { display: flex; align-items: center; gap: var(--sp-4); }
.gks-stats__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  background: var(--brand-050);
  color: var(--brand-600);
  border-radius: var(--radius-2);
}
.gks-stats__item dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-black);
  font-variant-numeric: var(--num-tabular);
  line-height: 1.1;
  color: var(--text-strong);
}
.gks-stats__item dt { font-size: var(--fs-caption); color: var(--text-muted); }

/* ---- Trust wall ---- */
.gks-trust__head { align-items: center; margin-bottom: var(--sp-5); }
.gks-trust__count {
  flex: none;
  padding: 6px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--brand-050);
  color: var(--brand-700);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
}
.gks-trust__count strong { font-weight: var(--fw-black); }
.gks-trust {
  position: relative;
  overflow: hidden;
  padding: 2px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
}
.gks-trust__track {
  display: flex;
  width: max-content;
  animation: gks-trust-scroll 42s linear infinite;
}
.gks-trust:hover .gks-trust__track { animation-play-state: paused; }
.gks-trust__group {
  display: flex;
  flex: none;
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0 var(--sp-4) 0 0;
}
.gks-trust__item {
  display: grid;
  place-items: center;
  width: 140px;
  height: 120px;
  padding: var(--sp-4);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  color: var(--text-subtle);
  transition: var(--transition-control), transform var(--dur-fast) var(--ease-standard);
}
.gks-trust__item:hover { border-color: var(--brand-200); transform: translateY(-2px); }
.gks-trust__item img { width: 80px; height: 80px; object-fit: contain; }
@keyframes gks-trust-scroll { to { transform: translateX(-50%); } }

/* ---- Featured university filters ---- */
.gks-city-filter {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding-bottom: var(--sp-2);
  overflow-x: auto;
  scrollbar-width: thin;
}
.gks-city-filter__button {
  flex: none;
  min-height: 36px;
  padding: 0 var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-muted);
  font: inherit;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-city-filter__button:hover { border-color: var(--brand-300); color: var(--brand-700); }
.gks-city-filter__button--active {
  border-color: var(--brand-600);
  background: var(--brand-600);
  color: var(--text-inverse);
}
.gks-city-filter__button--active:hover { color: var(--text-inverse); }
.gks-carousel-controls { display: flex; flex: none; gap: var(--sp-2); }
.gks-home__carousel {
  display: flex;
  gap: var(--sp-4);
  margin: var(--sp-4) 0 0;
  padding: 2px 2px var(--sp-3);
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  list-style: none;
}
.gks-home__carousel::-webkit-scrollbar { display: none; }
.gks-home__carousel > li {
  flex: 0 0 min(310px, calc(88vw - var(--sp-8)));
  scroll-snap-align: start;
}
.gks-featured-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-soft);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}
.gks-featured-footer strong { color: var(--text-strong); }
.gks-home__skeleton {
  min-height: 250px;
  border-radius: var(--radius-2);
  background: linear-gradient(90deg, var(--n-100) 25%, var(--n-050) 50%, var(--n-100) 75%);
  background-size: 200% 100%;
  animation: gks-home-shimmer 1.4s infinite;
}
.gks-home__empty { margin-top: var(--sp-4); color: var(--text-muted); }
@keyframes gks-home-shimmer { to { background-position: -200% 0; } }

.gks-home__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

/* ---- FAQ ---- */
.gks-faq { display: flex; flex-direction: column; gap: var(--sp-3); max-width: 860px; }
.gks-faq__item {
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  box-shadow: var(--shadow-raised);
  padding: var(--sp-4) var(--sp-5);
}
.gks-faq__item summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  cursor: pointer;
  list-style: none;
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-faq__item summary::-webkit-details-marker { display: none; }
.gks-faq__chevron { flex: none; transition: transform var(--dur-fast) var(--ease-standard); color: var(--text-subtle); }
.gks-faq__item[open] .gks-faq__chevron { transform: rotate(180deg); color: var(--brand-600); }
.gks-faq__item p {
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-muted);
}

/* ---- Closing CTA ---- */
.gks-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-6);
  flex-wrap: wrap;
  padding: var(--sp-8);
  border-radius: var(--radius-4);
  background: linear-gradient(120deg, var(--brand-100) 0%, #e8f0ff 55%, #dfeaff 100%);
  border: var(--border-hair) solid var(--brand-200);
}
.gks-cta__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-cta__text { margin-top: var(--sp-2); max-width: 60ch; color: var(--text-muted); line-height: var(--lh-body); }

@media (max-width: 900px) {
  .gks-hero {
    grid-template-columns: 1fr;
    padding: 0;
    gap: var(--sp-6);
  }
  .gks-hero__copy { padding: var(--sp-7) var(--sp-6) 0; }
  .gks-hero__title { font-size: var(--fs-h1); }
  .gks-hero__media { min-height: 240px; }
  .gks-hero__media img {
    position: relative;
    -webkit-mask-image: none;
    mask-image: none;
  }
  .gks-cta { padding: var(--sp-6); }
}

@media (max-width: 640px) {
  .gks-section__head:not(.gks-trust__head) { align-items: center; }
  .gks-section__link { white-space: normal; }
  .gks-featured-footer { align-items: flex-start; flex-direction: column; }
  .gks-trust__head { align-items: flex-start; flex-direction: column; gap: var(--sp-3); }
}

@media (prefers-reduced-motion: reduce) {
  .gks-trust { overflow-x: auto; mask-image: none; -webkit-mask-image: none; }
  .gks-trust__track { animation: none; }
  .gks-trust__group[aria-hidden="true"] { display: none; }
}
</style>
