<script setup lang="ts">
/**
 * 2027 GKS бакалавр — the UIC (University Industry Cooperation) round.
 *
 * Every fact here is transcribed from NIIED's "2027 Global Korea Scholarship
 * Application Guidelines for Undergraduate Degrees" (2026.09): §I.3 for the
 * department table, §II for eligibility, §III for the schedule, §VII for the
 * benefits. It is transcribed once, in this file, and nowhere else.
 *
 * Why a page of its own rather than a section on `/gks-scholarship`: that page
 * is the evergreen explainer of what GKS is, and it has to stay true next year.
 * This one is a single round with named departments and a deadline eight weeks
 * out — the thing a Facebook post links to, which is worthless the moment it is
 * written in general terms.
 *
 * What the page leads with is what the scholarship pays for, not how many are
 * admitted: the quotas are in the guidelines and are deliberately left there.
 */

type MajorGroup = 'AI' | 'ENGINEERING' | 'BIO';

/**
 * The ten schools, as the catalogue already spells them — so a card can link
 * straight to `/universities/<slug>` instead of dead-ending on a name.
 */
const UNIVERSITIES = {
  ajou: { slug: 'ajou-university', name: 'Ажу их сургууль', city: 'Сүвон' },
  daegu: { slug: 'daegu-university', name: 'Тэгү их сургууль', city: 'Тэгү' },
  dongA: { slug: 'dong-a-university', name: 'Дон-А их сургууль', city: 'Пусан' },
  inje: { slug: 'inje-university', name: 'Инже их сургууль', city: 'Пусан' },
  keimyung: { slug: 'keimyung-university', name: 'Кемён их сургууль', city: 'Тэгү' },
  konyang: { slug: 'konyang-university', name: 'Конян их сургууль', city: 'Тэжон' },
  kookmin: { slug: 'kookmin-university', name: 'Кукмин их сургууль', city: 'Сөүл' },
  koreatech: { slug: 'koreatech', name: 'КОРЕАТЕХ', city: 'Чонан' },
  sungshin: { slug: 'sungshin-womens-university', name: 'Сонгсин эмэгтэйчүүдийн их сургууль', city: 'Сөүл' },
  yeungnam: { slug: 'yeungnam-university', name: 'Ённам их сургууль', city: 'Кёнсан' },
} as const;

interface Major {
  group: MajorGroup;
  /** The Mongolian wording the office uses for this department. */
  name: string;
  /** The department's official English name — what the application form asks for. */
  nameEn: string;
  university: (typeof UNIVERSITIES)[keyof typeof UNIVERSITIES];
  /** A restriction a reader must see before they plan around the department. */
  note?: string;
}

/**
 * Grouped, and inside a group the departments that take the most students
 * first. The intake sizes themselves are deliberately not on the page — a quota
 * reads as a lottery, and the reader's decision is which department fits them,
 * not which one has the longest queue.
 */
const MAJORS: Major[] = [
  {
    group: 'AI',
    name: 'Хиймэл оюун ба компьютерын инженер',
    nameEn: 'School of AI and Computer Engineering',
    university: UNIVERSITIES.ajou,
  },
  {
    group: 'AI',
    name: 'Программ хангамж',
    nameEn: 'Software',
    university: UNIVERSITIES.kookmin,
  },
  {
    group: 'AI',
    name: 'Ухаалаг аюулгүй байдал',
    nameEn: 'Smart Security',
    university: UNIVERSITIES.konyang,
  },
  {
    group: 'AI',
    name: 'Хиймэл оюун ухаан',
    nameEn: 'Artificial Intelligence',
    university: UNIVERSITIES.konyang,
  },
  {
    group: 'AI',
    name: 'Компьютерын инженер',
    nameEn: 'Computer Engineering Major',
    university: UNIVERSITIES.koreatech,
  },
  {
    group: 'AI',
    name: 'Статистик / Их өгөгдөл',
    nameEn: 'Statistics / Big Data Science Major',
    university: UNIVERSITIES.sungshin,
    note: 'Зөвхөн эмэгтэй',
  },
  {
    group: 'AI',
    name: 'Хиймэл оюуны программ хангамж',
    nameEn: 'AI Software',
    university: UNIVERSITIES.inje,
  },
  {
    group: 'AI',
    name: 'Эмнэлгийн мэдээллийн технологи',
    nameEn: 'Medical Information Technology',
    university: UNIVERSITIES.inje,
  },
  {
    group: 'ENGINEERING',
    name: 'Байгаль орчны инженер',
    nameEn: 'Environmental Engineering',
    university: UNIVERSITIES.yeungnam,
  },
  {
    group: 'ENGINEERING',
    name: 'Автомашины инженер',
    nameEn: 'Mechanical and Electrical Automotive Engineering',
    university: UNIVERSITIES.inje,
  },
  {
    group: 'ENGINEERING',
    name: 'Механик инженер',
    nameEn: 'Mechanical Engineering',
    university: UNIVERSITIES.keimyung,
  },
  {
    group: 'ENGINEERING',
    name: 'Механик инженер',
    nameEn: 'Mechanical Engineering Major',
    university: UNIVERSITIES.koreatech,
  },
  {
    group: 'ENGINEERING',
    name: 'Электроникийн инженер',
    nameEn: 'Division of Electronic Engineering',
    university: UNIVERSITIES.daegu,
  },
  {
    group: 'BIO',
    name: 'Хүнс ба хоол зүй',
    nameEn: 'Food Science and Nutrition',
    university: UNIVERSITIES.dongA,
  },
  {
    group: 'BIO',
    name: 'Эмийн биотехнологи',
    nameEn: 'Medicinal Biotechnology',
    university: UNIVERSITIES.dongA,
  },
  {
    group: 'BIO',
    name: 'Хүнс, шим тэжээлийн инженер',
    nameEn: 'Food Nutrition and Food Engineering',
    university: UNIVERSITIES.inje,
  },
];

/**
 * The split is a part-to-whole of three classes where the story is which class
 * is biggest — so one hue, more-is-darker, rather than three identities
 * competing for attention.
 */
const GROUPS: { id: MajorGroup; label: string; tab: string; fill: string }[] = [
  { id: 'AI', label: 'Хиймэл оюун · Программ · Өгөгдөл', tab: 'Хиймэл оюун · IT', fill: 'var(--brand-700)' },
  { id: 'ENGINEERING', label: 'Инженер', tab: 'Инженер', fill: 'var(--brand-500)' },
  { id: 'BIO', label: 'Хүнс · Био · Эм', tab: 'Хүнс · Био', fill: 'var(--brand-300)' },
];

const groupStats = GROUPS.map((group) => {
  const count = MAJORS.filter((major) => major.group === group.id).length;
  return { ...group, count, share: Math.round((count / MAJORS.length) * 100) };
});

const FIGURES = [
  { value: String(MAJORS.length), label: 'мэргэжил' },
  { value: String(new Set(MAJORS.map((major) => major.university.slug)).size), label: 'их сургууль' },
  { value: '5–7', label: 'жил, бүрэн тэтгэлэгтэй' },
];

const activeGroup = ref<MajorGroup | 'ALL'>('ALL');
const visibleMajors = computed(() =>
  activeGroup.value === 'ALL' ? MAJORS : MAJORS.filter((major) => major.group === activeGroup.value),
);

const BENEFITS = [
  {
    icon: 'graduation-cap',
    title: 'Сургалтын төлбөр',
    value: '100%',
    note: 'NIIED семестрт 5 сая ₩ хүртэл төлнө; түүнээс дээшхийг болон элсэлтийн хураамжийг сургууль өөрөө даана.',
  },
  {
    icon: 'wallet-cards',
    title: 'Сар бүрийн тэтгэмж',
    value: '1.13–1.2 сая ₩',
    note: 'Хэлний бэлтгэлийн үед жилд 13,560,000₩, мэргэжлийн хичээлийн үед 14,400,000₩. Байр, эрүүл мэндийн даатгал, суурьшилтын дэмжлэг үүнд орно.',
  },
  {
    icon: 'plane',
    title: 'Онгоцны тийз',
    value: '2 талдаа',
    note: 'Эконом класс, бодит зардлаар. Зарлагдах үед Солонгост байгаа хүнд ирэх тийз олгохгүй.',
  },
  {
    icon: 'languages',
    title: 'Солонгос хэлний бэлтгэл',
    value: '1 жил',
    note: 'Жилд 5,200,000₩ хүртэл. TOPIK 5 эсвэл 6-тай бол бэлтгэлээс чөлөөлөгдөж, шууд мэргэжлээрээ орно.',
  },
];

const ELIGIBILITY = [
  '2002 оны 3 сарын 1-ээс хойш төрсөн — 25 хүрээгүй',
  'Бүрэн дунд боловсрол эзэмшсэн, эсвэл 2026 оны 12 сарын 31-ээс өмнө төгсөх',
  'Голч: 100 онооны системд 80+ · эсвэл ангийнхаа дээд 20% · эсвэл 2.64/4.0, 2.80/4.3, 2.91/4.5, 3.23/5.0',
  'Өөрөө болон эцэг эх (хууль ёсны хамгаалагч) БНСУ-ын иргэн биш',
  'Солонгост ахлах сургууль, коллеж төгсөөгүй; бакалаврын диплом аль хэдийн байгаа бол мэдүүлэхгүй',
  'Солонгосын Засгийн газрын дипломын тэтгэлгийг өмнө нь аваагүй',
];

const TRACKS = [
  {
    name: 'Элчин сайдын яамны шугам',
    reach: 'Улсын квотоор',
    highlight: false,
    points: [
      'General болон R-GKS гэсэн хоёр хөтөлбөр',
      '3 хүртэл сургууль сонгоно, дор хаяж нэг нь Type B байх',
      'studyinkorea.go.kr дээр онлайнаар: 2026.09.15 – 09.30',
      'Бүх чиглэл нээлттэй',
    ],
  },
  {
    name: 'UIC — үйлдвэр, сургуулийн хамтарсан',
    reach: 'Улсын квот байхгүй',
    highlight: true,
    points: [
      'Дэлхийн бүх улсын оюутанд нээлттэй',
      'Нэг сургууль, нэг мэргэжилд л мэдүүлнэ',
      'Материалаа сургууль руу шууд: 9–11 сар, сургуулийн өөрийн хугацаагаар',
      'Байгалийн шинжлэх ухаан, инженер; үйлдвэрийн дадлага, ажлын байрны дэмжлэгтэй',
    ],
  },
];

const TIMELINE = [
  {
    when: '9–11 сар',
    title: 'Материалаа сургууль руу',
    note: 'Хугацаа, авах материал, хүргэх хэлбэр сургууль тус бүр өөр. Сонгосон сургуулийнхаа зарыг өөрөө шалгана.',
  },
  {
    when: '11 сар',
    title: '1-р шатны хариу',
    note: 'Сургууль өөрөө шалгаруулж, тэнцсэн хүний материалыг 11 сарын 30-наас өмнө NIIED-д хүргүүлнэ.',
  },
  {
    when: '12 сарын дунд',
    title: '2-р шатны хариу',
    note: 'NIIED шалгаруулж, studyinkorea.go.kr дээр зарлана.',
  },
  {
    when: '2027.01.07',
    title: 'Эцсийн жагсаалт',
    note: '2027 оны GKS тэтгэлэгтнүүд зарлагдана — тооцоолсон хугацаа.',
  },
];

// Absolute, and off the canonical origin rather than the request's: a share
// scraped from the EC2 host's own address must still point at gksedu.mn.
const socialImage = `${useSiteUrl()}/img/gks-scholarship-og.png`;

useHead({ title: `2027 GKS бакалавр · ${MAJORS.length} мэргэжил бүрэн тэтгэлгээр` });
useSeoMeta({
  description:
    `2027 оны GKS бакалаврын UIC хөтөлбөр: 10 их сургуулийн ${MAJORS.length} мэргэжил. Сургалтын төлбөр 100%, ` +
    'сар бүрийн тэтгэмж, онгоцны тийз, солонгос хэлний бэлтгэл. Хиймэл оюун, программ хангамж, инженер, хүнс-био.',
  ogTitle: `2027 GKS: ${MAJORS.length} мэргэжил бүрэн тэтгэлгээр`,
  ogDescription: 'Сургалтын төлбөр 100%, сар бүрийн тэтгэмж, онгоцны тийз, хэлний бэлтгэл. Улсын квот байхгүй.',
  ogType: 'website',
  ogImage: socialImage,
  twitterCard: 'summary_large_image',
  twitterImage: socialImage,
});
</script>

<template>
  <div class="uic">
    <!-- ── Hero ─────────────────────────────────────────────────────────── -->
    <header class="uic-hero">
      <p class="uic-kicker">2027 GLOBAL KOREA SCHOLARSHIP · БАКАЛАВР</p>
      <h1>
        Инженер, хиймэл оюун.
        <span>Бакалавр бүрэн тэтгэлгээр.</span>
      </h1>
      <p class="uic-hero__lead">
        Солонгосын Засгийн газрын 2027 оны бакалаврын тэтгэлэгт үйлдвэр, сургуулийн хамтарсан
        (UIC) хөтөлбөрөөр 10 их сургуулийн {{ MAJORS.length }} мэргэжил зарлагдлаа. Сургалтын
        төлбөр, амьдрах зардал, онгоцны тийз, хэлний бэлтгэл
        <strong>бүгд тэтгэлэгт багтана</strong>.
      </p>
      <div class="uic-hero__actions">
        <DsButton
          variant="accent"
          size="lg"
          icon-right="arrow-right"
          @click="navigateTo('/consultation?service=GKS_SCHOLARSHIP')"
        >
          Үнэгүй зөвлөгөө авах
        </DsButton>
        <DsButton variant="secondary" size="lg" @click="navigateTo('/gks-check')">
          Боломжоо 1 минутад шалгах
        </DsButton>
      </div>
      <div class="uic-hero__more">
        <a href="#majors" class="uic-hero__link">
          {{ MAJORS.length }} мэргэжлийг харах
          <DsIcon name="arrow-down" :size="16" />
        </a>
        <NuxtLink to="/gks-scholarship" class="uic-hero__link">
          GKS тэтгэлгийн тухай
          <DsIcon name="arrow-right" :size="16" />
        </NuxtLink>
      </div>

      <dl class="uic-figures">
        <div v-for="figure in FIGURES" :key="figure.label">
          <dd>{{ figure.value }}</dd>
          <dt>{{ figure.label }}</dt>
        </div>
      </dl>
    </header>

    <!-- ── Benefits ─────────────────────────────────────────────────────── -->
    <section class="uic-section" aria-labelledby="benefits-title">
      <div class="uic-section__intro">
        <p class="uic-kicker uic-kicker--muted">ТЭТГЭЛЭГ ЮУ ДААХ ВЭ</p>
        <h2 id="benefits-title">Сурах, амьдрах зардлыг бүрэн даана.</h2>
      </div>
      <ul class="uic-benefits">
        <li v-for="benefit in BENEFITS" :key="benefit.title">
          <span class="uic-benefits__icon"><DsIcon :name="benefit.icon" :size="22" /></span>
          <p class="uic-benefits__title">{{ benefit.title }}</p>
          <strong>{{ benefit.value }}</strong>
          <small>{{ benefit.note }}</small>
        </li>
      </ul>
    </section>

    <!-- ── What this round is weighted towards ──────────────────────────── -->
    <section class="uic-section uic-split" aria-labelledby="split-title">
      <div class="uic-section__intro">
        <p class="uic-kicker uic-kicker--muted">ЭНЭ УДААГИЙН ЖАГСААЛТ</p>
        <h2 id="split-title">Жагсаалтын яг хагас нь хиймэл оюун, программ, өгөгдөл.</h2>
        <p class="uic-lede">
          {{ MAJORS.length }} мэргэжлийн {{ groupStats[0]!.count }} нь хиймэл оюун ухаан,
          программ хангамж, өгөгдлийн шинжлэх ухаан, кибер аюулгүй байдал. Монголын оюутнуудын
          хамгийн их сонирхож байгаа, зах зээл дээр хамгийн хүчтэй эрэлттэй байгаа чиглэл энэ
          удаад тэтгэлгийн жагсаалтын гол цөм болсон гэсэн үг.
        </p>
      </div>

      <figure class="uic-bar-figure">
        <div class="uic-bar" role="img" :aria-label="`${MAJORS.length} мэргэжлийн хуваарилалт: ${groupStats.map((group) => `${group.label} ${group.count}`).join(', ')}`">
          <span
            v-for="group in groupStats"
            :key="group.id"
            class="uic-bar__segment"
            :style="{ flexGrow: group.count, background: group.fill }"
          />
        </div>
        <figcaption>
          <ul class="uic-bar__legend">
            <li v-for="group in groupStats" :key="group.id">
              <span class="uic-bar__swatch" :style="{ background: group.fill }" />
              <span class="uic-bar__name">{{ group.label }}</span>
              <span class="uic-bar__value gks-tnum">{{ group.count }} мэргэжил · {{ group.share }}%</span>
            </li>
          </ul>
        </figcaption>
      </figure>
    </section>

    <!-- ── The list itself ──────────────────────────────────────────────── -->
    <section id="majors" class="uic-section" aria-labelledby="majors-title">
      <div class="uic-section__intro">
        <p class="uic-kicker uic-kicker--muted">{{ MAJORS.length }} МЭРГЭЖИЛ</p>
        <h2 id="majors-title">Аль сургуульд, аль мэргэжил байна.</h2>
        <p class="uic-lede">
          Нэг сургуулийн нэг мэргэжилд л мэдүүлнэ — хоёр өөр хөтөлбөрт өгсөн материал
          шалгаруулалтаас хасагдана. Шалгарсны дараа мэргэжлээ солих боломжгүй тул сонголтоо
          өөрийн хүчтэй тал, байршил хоёроороо жинлэж хийнэ.
        </p>
      </div>

      <div class="uic-filter" role="group" aria-label="Чиглэлээр шүүх">
        <button
          type="button"
          class="uic-filter__chip"
          :aria-pressed="activeGroup === 'ALL'"
          @click="activeGroup = 'ALL'"
        >
          Бүгд <span class="gks-tnum">{{ MAJORS.length }}</span>
        </button>
        <button
          v-for="group in groupStats"
          :key="group.id"
          type="button"
          class="uic-filter__chip"
          :aria-pressed="activeGroup === group.id"
          @click="activeGroup = group.id"
        >
          {{ group.tab }} <span class="gks-tnum">{{ group.count }}</span>
        </button>
      </div>

      <ul class="uic-majors">
        <li v-for="major in visibleMajors" :key="`${major.university.slug}-${major.nameEn}`">
          <NuxtLink :to="`/universities/${major.university.slug}`" class="uic-major">
            <h3>{{ major.name }}</h3>
            <p class="uic-major__en">{{ major.nameEn }}</p>
            <p v-if="major.note" class="uic-major__note">{{ major.note }}</p>
            <footer>
              <span>{{ major.university.name }}</span>
              <span class="uic-major__city">{{ major.university.city }}</span>
              <DsIcon name="arrow-right" :size="16" />
            </footer>
          </NuxtLink>
        </li>
      </ul>

      <p class="uic-footnote">
        Механик инженер хоёр сургуульд байгаа тул нэр нь давхардаж байна. Сургууль, мэргэжил
        тус бүрийн нэмэлт шаардлагыг (хэлний оноо, мэргэжлийн шаардлага) сургуулийн зараас
        шалгана.
      </p>
    </section>

    <!-- ── Eligibility ──────────────────────────────────────────────────── -->
    <section class="uic-eligibility" aria-labelledby="eligibility-title">
      <div>
        <p class="uic-kicker uic-kicker--light">ШАЛГУУР</p>
        <h2 id="eligibility-title">Шалгуур нь<br>ойлгомжтой.</h2>
        <NuxtLink to="/gks-check" class="uic-eligibility__check">
          Би хангах уу? — 1 минутад шалгах
          <DsIcon name="arrow-right" :size="16" />
        </NuxtLink>
      </div>
      <ul>
        <li v-for="item in ELIGIBILITY" :key="item">
          <DsIcon name="circle-check" :size="20" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>

    <!-- ── The two tracks ───────────────────────────────────────────────── -->
    <section class="uic-section" aria-labelledby="tracks-title">
      <div class="uic-section__intro">
        <p class="uic-kicker uic-kicker--muted">ХОЁР ШУГАМ</p>
        <h2 id="tracks-title">Элчин сайдын яам, эсвэл шууд сургууль.</h2>
      </div>
      <div class="uic-tracks">
        <article
          v-for="track in TRACKS"
          :key="track.name"
          class="uic-track"
          :class="{ 'uic-track--highlight': track.highlight }"
        >
          <h3>{{ track.name }}</h3>
          <p class="uic-track__reach">{{ track.reach }}</p>
          <ul>
            <li v-for="point in track.points" :key="point">
              <DsIcon name="minus" :size="16" />
              <span>{{ point }}</span>
            </li>
          </ul>
        </article>
      </div>
      <p class="uic-footnote">
        Элчин сайдын яамны шугамын 1-р шатанд тэнцээгүй хүн UIC-д дахин мэдүүлж болно — UIC-ийн
        хугацаа тусгайлан хожуу тавигдсан нь ч тийм учраас.
        <NuxtLink to="/gks-scholarship">GKS тэтгэлэг гэж юу болох, магистр, докторын шугам
        хэрхэн явдгийг эндээс уншина уу.</NuxtLink>
      </p>
    </section>

    <!-- ── Timeline ─────────────────────────────────────────────────────── -->
    <section class="uic-section" aria-labelledby="timeline-title">
      <div class="uic-section__intro">
        <p class="uic-kicker uic-kicker--muted">ХУГАЦАА · UIC</p>
        <h2 id="timeline-title">Эцсийн хугацаа нь сургууль тус бүрийнх.</h2>
      </div>
      <ol class="uic-timeline">
        <li v-for="step in TIMELINE" :key="step.title">
          <p class="uic-timeline__when gks-tnum">{{ step.when }}</p>
          <h3>{{ step.title }}</h3>
          <p>{{ step.note }}</p>
        </li>
      </ol>
      <p class="uic-footnote">
        Тов шалгаруулалтын явцад өөрчлөгдөж болно. Эх сурвалж: NIIED, «2027 Global Korea
        Scholarship Application Guidelines for Undergraduate Degrees» (2026.09) —
        <a href="https://www.studyinkorea.go.kr" target="_blank" rel="noopener noreferrer">
          studyinkorea.go.kr
        </a>
      </p>
    </section>

    <!-- ── Call to action ───────────────────────────────────────────────── -->
    <section class="uic-cta">
      <p class="uic-kicker uic-kicker--light">50+ ОЮУТНЫГ GKS ТЭТГЭЛЭГТ ТЭНЦҮҮЛСЭН</p>
      <h2>Сонголтоо хамтдаа жинлэе.</h2>
      <p class="uic-cta__lead">
        Сургууль, мэргэжлийн сонголтоос эсээ, судалгааны төлөвлөгөө, орчуулга, нотариат,
        материал хүргэх хүртэл эхнээс дуустал.
      </p>
      <DsButton
        variant="accent"
        size="lg"
        icon-right="arrow-right"
        @click="navigateTo('/consultation?service=GKS_SCHOLARSHIP')"
      >
        Үнэгүй зөвлөгөө авах
      </DsButton>
      <NuxtLink to="/gks-scholarship" class="uic-cta__link">
        GKS тэтгэлгийн тухай бүрэн мэдээлэл
        <DsIcon name="arrow-right" :size="16" />
      </NuxtLink>
    </section>
  </div>
</template>

<style scoped>
.uic {
  display: flex;
  flex-direction: column;
  gap: var(--sp-12);
}

.uic-kicker {
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps);
  color: var(--brand-600);
}
.uic-kicker--muted { color: var(--text-subtle); }
.uic-kicker--light { color: var(--brand-200); }

/* ---- Hero: type only. No photograph competes with the list below. ---- */
.uic-hero {
  max-width: 860px;
  margin: 0 auto;
  padding: var(--sp-10) 0 0;
  text-align: center;
}
.uic-hero h1 {
  margin-top: var(--sp-5);
  font-size: clamp(40px, 6.4vw, 80px);
  font-weight: var(--fw-black);
  line-height: .98;
  letter-spacing: -.045em;
  text-wrap: balance;
  color: var(--text-strong);
}
.uic-hero h1 span { display: block; color: var(--brand-600); }
.uic-hero__lead {
  max-width: 660px;
  margin: var(--sp-6) auto 0;
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
  color: var(--text-muted);
}
.uic-hero__lead strong { color: var(--text-strong); font-weight: var(--fw-semibold); }
.uic-hero__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-7);
}
.uic-hero__more {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--sp-6);
  margin-top: var(--sp-5);
}
.uic-hero__link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  text-decoration: none;
}
.uic-hero__link:hover { color: var(--brand-700); }

/* A KPI row, not four hero figures — so the values stay below display size and
   wear the font's proportional digits. */
.uic-figures {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-5);
  margin: var(--sp-10) 0 0;
  padding-top: var(--sp-7);
  border-top: 1px solid var(--line-hairline);
  text-align: left;
}
.uic-figures div { min-width: 0; }
.uic-figures dd {
  margin: 0;
  font-size: clamp(30px, 4vw, 40px);
  font-weight: var(--fw-bold);
  line-height: 1;
  letter-spacing: -.03em;
  color: var(--text-strong);
}
.uic-figures dt {
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  line-height: 1.4;
  color: var(--text-subtle);
}

/* ---- Section scaffolding ---- */
.uic-section__intro { max-width: 760px; }
.uic-section__intro h2,
.uic-eligibility h2,
.uic-cta h2 {
  margin-top: var(--sp-3);
  font-size: clamp(28px, 3.6vw, 44px);
  font-weight: var(--fw-black);
  line-height: 1.1;
  letter-spacing: -.03em;
  text-wrap: balance;
  color: var(--text-strong);
}
.uic-lede {
  margin-top: var(--sp-5);
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
  color: var(--text-muted);
}
.uic-footnote {
  margin-top: var(--sp-5);
  max-width: 76ch;
  font-size: var(--fs-caption);
  line-height: 1.55;
  color: var(--text-subtle);
}
.uic-footnote a { color: var(--brand-700); text-underline-offset: 3px; }

/* ---- Seat split: one hue, more-is-darker, direct-labelled ---- */
.uic-split { display: grid; gap: var(--sp-8); }
.uic-bar-figure { margin: 0; }
.uic-bar {
  display: flex;
  gap: 2px;                       /* the surface doing the separating */
  height: 22px;
  overflow: hidden;
  border-radius: 4px;
}
.uic-bar__segment { display: block; min-width: 4px; }
.uic-bar__legend {
  display: grid;
  gap: var(--sp-3);
  margin: var(--sp-6) 0 0;
  padding: 0;
  list-style: none;
}
.uic-bar__legend li {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  padding-bottom: var(--sp-3);
  border-bottom: 1px solid var(--line-soft);
}
.uic-bar__swatch {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  transform: translateY(-1px);
}
.uic-bar__name { flex: 1; font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-body); }
.uic-bar__value { font-size: var(--fs-body-sm); color: var(--text-muted); white-space: nowrap; }

/* ---- Filter chips ---- */
.uic-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-top: var(--sp-7);
}
.uic-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  height: var(--control-sm);
  padding: 0 var(--sp-4);
  border: 1px solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-control);
}
.uic-filter__chip span { color: var(--text-subtle); }
.uic-filter__chip:hover { border-color: var(--line-strong); color: var(--text-strong); }
.uic-filter__chip[aria-pressed='true'] {
  border-color: var(--ink-900);
  background: var(--ink-900);
  color: var(--n-000);
}
.uic-filter__chip[aria-pressed='true'] span { color: var(--n-400); }

/* ---- The majors grid ---- */
.uic-majors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-4);
  margin: var(--sp-6) 0 0;
  padding: 0;
  list-style: none;
}
.uic-major {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  padding: var(--sp-6);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  text-decoration: none;
  transition: var(--transition-control),
    transform var(--dur-fast) var(--ease-standard),
    box-shadow var(--dur-fast) var(--ease-standard);
}
.uic-major:hover {
  border-color: var(--brand-200);
  box-shadow: var(--shadow-card);
  transform: translateY(-2px);
}
.uic-major h3 {
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  line-height: 1.25;
  letter-spacing: var(--ls-heading);
  color: var(--text-strong);
}
.uic-major__en {
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  line-height: 1.45;
  color: var(--text-subtle);
}
.uic-major__note {
  align-self: flex-start;
  margin-top: var(--sp-3);
  padding: 2px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--brand-050);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--brand-700);
}
.uic-major footer {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: auto;
  padding-top: var(--sp-5);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
}
.uic-major footer > span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.uic-major__city { flex: none; font-weight: var(--fw-regular); color: var(--text-subtle); }
.uic-major footer :deep(.gks-icon) { margin-left: auto; flex: none; color: var(--brand-600); }

/* ---- Benefits ---- */
.uic-benefits {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
  margin: var(--sp-7) 0 0;
  padding: 0;
  list-style: none;
}
.uic-benefits li {
  min-width: 0;
  padding: var(--sp-6);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.uic-benefits__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-2);
  background: var(--brand-050);
  color: var(--brand-700);
}
.uic-benefits__title { margin-top: var(--sp-5); font-size: var(--fs-caption); color: var(--text-muted); }
.uic-benefits strong {
  display: block;
  margin-top: 2px;
  font-size: var(--fs-h3);
  line-height: 1.2;
  letter-spacing: -.02em;
  color: var(--text-strong);
}
.uic-benefits small {
  display: block;
  margin-top: var(--sp-3);
  font-size: var(--fs-caption);
  line-height: 1.55;
  color: var(--text-subtle);
}

/* ---- Eligibility ---- */
.uic-eligibility {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: var(--sp-9);
  padding: var(--sp-10) var(--sp-9);
  border-radius: var(--radius-4);
  background: var(--brand-700);
  color: var(--n-000);
}
.uic-eligibility h2 { color: var(--n-000); }
.uic-eligibility__check {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-6);
  color: var(--n-000);
  font-weight: var(--fw-semibold);
  text-decoration: underline;
  text-underline-offset: 4px;
}
.uic-eligibility ul { display: grid; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }
.uic-eligibility li {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, .1);
  font-size: var(--fs-body-sm);
  line-height: 1.5;
  font-weight: var(--fw-medium);
}
.uic-eligibility li :deep(.gks-icon) { flex: none; color: var(--brand-200); }

/* ---- The two tracks ---- */
.uic-tracks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
  margin-top: var(--sp-7);
}
.uic-track {
  padding: var(--sp-7);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.uic-track--highlight { border-color: var(--brand-600); box-shadow: var(--shadow-card); }
.uic-track h3 { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.uic-track__reach {
  margin-top: var(--sp-2);
  font-size: var(--fs-h3);
  font-weight: var(--fw-black);
  letter-spacing: -.02em;
  color: var(--brand-700);
}
.uic-track ul { display: grid; gap: var(--sp-3); margin: var(--sp-6) 0 0; padding: 0; list-style: none; }
.uic-track li {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  font-size: var(--fs-body-sm);
  line-height: 1.5;
  color: var(--text-body);
}
.uic-track li :deep(.gks-icon) { flex: none; margin-top: 3px; color: var(--n-400); }

/* ---- Timeline ---- */
.uic-timeline {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-5);
  margin: var(--sp-7) 0 0;
  padding: 0;
  list-style: none;
}
.uic-timeline li { min-width: 0; padding-top: var(--sp-5); border-top: 2px solid var(--brand-200); }
.uic-timeline__when { font-family: var(--font-mono); font-size: var(--fs-caption); color: var(--brand-600); }
.uic-timeline h3 {
  margin-top: var(--sp-3);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.uic-timeline li p:last-child {
  margin-top: var(--sp-2);
  font-size: var(--fs-caption);
  line-height: 1.55;
  color: var(--text-muted);
}

/* ---- CTA ---- */
.uic-cta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--sp-10) var(--sp-9);
  border-radius: var(--radius-4);
  background: var(--ink-900);
}
.uic-cta h2 { color: var(--n-000); }
.uic-cta__lead {
  max-width: 56ch;
  margin-top: var(--sp-4);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--n-300);
}
.uic-cta :deep(.gks-btn) { margin-top: var(--sp-7); }
.uic-cta__link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-5);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--n-300);
  text-decoration: none;
}
.uic-cta__link:hover { color: var(--n-000); }

@media (max-width: 980px) {
  .uic { gap: var(--sp-11); }
  .uic-hero { padding-top: var(--sp-7); }
  .uic-majors { grid-template-columns: repeat(2, 1fr); }
  .uic-benefits { grid-template-columns: repeat(2, 1fr); }
  .uic-eligibility { grid-template-columns: 1fr; gap: var(--sp-7); }
  .uic-tracks { grid-template-columns: 1fr; }
  .uic-timeline { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .uic { gap: var(--sp-10); }
  .uic-hero { text-align: left; padding-top: var(--sp-4); }
  .uic-hero h1 { font-size: clamp(36px, 11vw, 52px); }
  .uic-hero__lead { font-size: var(--fs-body); }
  .uic-hero__actions { justify-content: flex-start; }
  .uic-figures { margin-top: var(--sp-8); padding-top: var(--sp-6); gap: var(--sp-3); }
  .uic-majors { grid-template-columns: 1fr; }
  .uic-major { padding: var(--sp-5); }
  .uic-benefits { grid-template-columns: 1fr; }
  .uic-benefits li { padding: var(--sp-5); }
  .uic-eligibility { padding: var(--sp-7) var(--sp-5); }
  .uic-track { padding: var(--sp-6) var(--sp-5); }
  .uic-timeline { grid-template-columns: 1fr; gap: var(--sp-6); }
  .uic-cta { padding: var(--sp-7) var(--sp-5); }
  .uic-bar__legend li { flex-wrap: wrap; }
  .uic-bar__value { width: 100%; padding-left: calc(10px + var(--sp-3)); }
}
</style>
