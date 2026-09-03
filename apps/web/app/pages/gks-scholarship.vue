<script setup lang="ts">
const BENEFITS = [
  { icon: 'graduation-cap', title: 'Сургалтын төлбөр', value: '100%', note: 'бүрэн дэмжлэг' },
  { icon: 'wallet-cards', title: 'Амьжиргааны тэтгэлэг', value: 'Сар бүр', note: 'тогтмол дэмжлэг' },
  { icon: 'plane', title: 'Онгоцны тийз', value: '2 талдаа', note: 'ирэх, буцах зардал' },
  { icon: 'languages', title: 'Солонгос хэл', value: '1 жил', note: 'хэлний бэлтгэл' },
];

const ELIGIBILITY = [
  'Сүүлийн сургалтын голч 80%+',
  'Бакалаврт 25 хүртэл нас',
  'Магистр, докторт 40 хүртэл нас',
  'Өөрөө болон эцэг эх БНСУ-ын иргэн биш',
];

const SCHEDULES = [
  {
    degree: 'Бакалавр',
    announce: '9 сар',
    apply: '9–10 сар',
    review: '10–12 сар',
    result: '12–1 сар',
  },
  {
    degree: 'Магистр · Доктор',
    announce: '2 сар',
    apply: '2–3 сар',
    review: '4–6 сар',
    result: '6–7 сар',
  },
];

const PROCESS = [
  { number: '01', title: 'Боломжоо үнэлнэ', note: 'Голч · нас · чиглэл' },
  { number: '02', title: 'Материалаа хүчтэй болгоно', note: 'Эсээ · төлөвлөгөө · сонголт' },
  { number: '03', title: 'Хугацаанд нь мэдүүлнэ', note: 'Элчин эсвэл сургууль' },
];

const requestUrl = useRequestURL();
const socialImage = `${requestUrl.origin}/img/gks-scholarship-og.png`;

useHead({ title: 'GKS · БНСУ-ын Засгийн газрын тэтгэлэг' });
useSeoMeta({
  description:
    'GKS тэтгэлгийн боломж, санхүүгийн дэмжлэг, үндсэн шалгуур болон жил бүрийн хугацаа. GKS EDU GROUP 50+ оюутныг тэтгэлэгт тэнцүүлсэн туршлагатай.',
  ogTitle: 'Санхүүгээс үл хамааран Солонгост сур · GKS',
  ogDescription: '100% сургалтын төлбөр, сар бүрийн тэтгэлэг, онгоцны тийз, хэлний бэлтгэл.',
  ogType: 'website',
  ogImage: socialImage,
  twitterCard: 'summary_large_image',
  twitterImage: socialImage,
});
</script>

<template>
  <div class="scholarship-page">
    <section class="scholarship-hero">
      <div class="scholarship-hero__content">
        <p class="scholarship-hero__eyebrow">GLOBAL KOREA SCHOLARSHIP</p>
        <h1>
          Санхүүгээс үл хамааран
          <span>Солонгост сур.</span>
        </h1>
        <p class="scholarship-hero__lead">
          Голч <strong>80%+</strong> бол тэтгэлгийн төлөө өрсөлдөх суурь боломж танд бий.
        </p>
        <div class="scholarship-hero__actions">
          <DsButton
            variant="accent"
            size="lg"
            icon-right="arrow-right"
            @click="navigateTo('/consultation?service=GKS_SCHOLARSHIP')"
          >
            Боломжоо үнэлүүлэх
          </DsButton>
          <a href="#schedule" class="scholarship-hero__text-link">
            Хугацаа харах
            <DsIcon name="arrow-down" :size="16" />
          </a>
        </div>
      </div>

      <div class="scholarship-hero__proof" aria-label="GKS EDU GROUP-ийн амжилт">
        <img
          src="/img/gks-scholarship-hero.jpg"
          srcset="/img/gks-scholarship-hero-900.jpg 900w, /img/gks-scholarship-hero.jpg 1536w"
          sizes="(max-width: 980px) 100vw, 520px"
          alt="Сөүл хот, Намсан цамхагийн зүг харж буй оюутан"
          width="1536"
          height="1024"
          fetchpriority="high"
        >
        <div class="scholarship-hero__proof-card">
          <strong class="gks-tnum">50+</strong>
          <span>оюутныг GKS тэтгэлэгт тэнцүүлсэн</span>
        </div>
      </div>
    </section>

    <section aria-labelledby="benefit-title" class="scholarship-section scholarship-benefits-section">
      <div class="scholarship-section__intro">
        <p class="scholarship-kicker">БҮРЭН ТЭТГЭЛЭГ</p>
        <h2 id="benefit-title">Сурахад хэрэгтэй гол зардлуудыг даана.</h2>
      </div>
      <ul class="scholarship-benefits">
        <li v-for="benefit in BENEFITS" :key="benefit.title">
          <span class="scholarship-benefits__icon"><DsIcon :name="benefit.icon" :size="22" /></span>
          <p>{{ benefit.title }}</p>
          <strong>{{ benefit.value }}</strong>
          <small>{{ benefit.note }}</small>
        </li>
      </ul>
      <p class="scholarship-benefits__note">
        Мөн суурьших дэмжлэг, эрүүл мэндийн даатгал болон хөтөлбөрөөс хамаарах нэмэлт тэтгэмжтэй.
      </p>
    </section>

    <section class="scholarship-access" aria-labelledby="access-title">
      <div>
        <p class="scholarship-kicker scholarship-kicker--light">ХЭНД БОЛОМЖТОЙ ВЭ?</p>
        <h2 id="access-title">Шалгуур нь ойлгомжтой.<br>Боломж нь өргөн.</h2>
      </div>
      <ul>
        <li v-for="item in ELIGIBILITY" :key="item">
          <DsIcon name="circle-check" :size="20" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>

    <section id="schedule" class="scholarship-section scholarship-schedule" aria-labelledby="schedule-title">
      <div class="scholarship-section__intro">
        <p class="scholarship-kicker">ЖИЛ БҮР</p>
        <h2 id="schedule-title">Хэзээ эхэлдэг вэ?</h2>
      </div>

      <div class="scholarship-schedule__grid">
        <article v-for="schedule in SCHEDULES" :key="schedule.degree" class="scholarship-schedule__card">
          <h3>{{ schedule.degree }}</h3>
          <dl>
            <div>
              <dt>Зарлагдана</dt>
              <dd class="gks-tnum">{{ schedule.announce }}</dd>
            </div>
            <div>
              <dt>Материал авна</dt>
              <dd class="gks-tnum">{{ schedule.apply }}</dd>
            </div>
            <div>
              <dt>Шалгаруулалт</dt>
              <dd class="gks-tnum">{{ schedule.review }}</dd>
            </div>
            <div>
              <dt>Эцсийн хариу</dt>
              <dd class="gks-tnum">{{ schedule.result }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <p class="scholarship-schedule__note">
        Тов жил бүр, сонгон шалгаруулах сувгаас хамаарч өөрчлөгдөнө.
        <a
          href="https://www.studyinkorea.go.kr/ko/plan/scholarship.do?tab=gks-tab1"
          target="_blank"
          rel="noopener noreferrer"
        >Албан ёсны мэдээлэл</a>
      </p>
    </section>

    <section class="scholarship-section scholarship-process" aria-labelledby="process-title">
      <div class="scholarship-section__intro">
        <p class="scholarship-kicker">GKS EDU-ТЭЙ</p>
        <h2 id="process-title">Төөрөхгүй, хоцрохгүй.</h2>
      </div>
      <ol>
        <li v-for="item in PROCESS" :key="item.number">
          <span class="gks-tnum">{{ item.number }}</span>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.note }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="scholarship-cta">
      <div>
        <p class="scholarship-kicker scholarship-kicker--light">50+ АМЖИЛТЫН ДАРААГИЙНХ НЬ ТА БАЙЖ БОЛНО</p>
        <h2>Өргөдлөө эрт эхлүүл.</h2>
      </div>
      <DsButton
        variant="accent"
        size="lg"
        icon-right="arrow-right"
        @click="navigateTo('/consultation?service=GKS_SCHOLARSHIP')"
      >
        Үнэгүй зөвлөгөө авах
      </DsButton>
    </section>
  </div>
</template>

<style scoped>
.scholarship-page {
  display: flex;
  flex-direction: column;
  gap: var(--sp-11);
}

.scholarship-hero {
  position: relative;
  min-height: 570px;
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(360px, .95fr);
  overflow: hidden;
  border-radius: var(--radius-5);
  background: var(--ink-950);
  box-shadow: var(--shadow-lift);
}
.scholarship-hero::before {
  content: '';
  position: absolute;
  width: 360px;
  height: 360px;
  left: -140px;
  bottom: -190px;
  border: 80px solid rgba(37, 99, 235, .22);
  border-radius: 50%;
  pointer-events: none;
}
.scholarship-hero__content {
  position: relative;
  z-index: 1;
  align-self: center;
  padding: var(--sp-11) var(--sp-9);
}
.scholarship-hero__eyebrow,
.scholarship-kicker {
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps);
  color: var(--brand-600);
}
.scholarship-hero__eyebrow { color: var(--brand-300); }
.scholarship-hero h1 {
  max-width: 720px;
  margin-top: var(--sp-5);
  font-size: clamp(42px, 6vw, 76px);
  font-weight: var(--fw-black);
  line-height: .98;
  letter-spacing: -.045em;
  color: var(--n-000);
}
.scholarship-hero h1 span { display: block; color: var(--brand-300); }
.scholarship-hero__lead {
  max-width: 42ch;
  margin-top: var(--sp-6);
  font-size: var(--fs-body-lg);
  color: var(--n-300);
}
.scholarship-hero__lead strong { color: var(--n-000); }
.scholarship-hero__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-5);
  margin-top: var(--sp-7);
}
.scholarship-hero__text-link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--n-300);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
.scholarship-hero__text-link:hover { color: var(--n-000); }
.scholarship-hero__proof { position: relative; min-height: 420px; }
.scholarship-hero__proof::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, var(--ink-950) 0%, transparent 40%), linear-gradient(0deg, rgba(13, 17, 22, .64), transparent 55%);
}
.scholarship-hero__proof img { width: 100%; height: 100%; object-fit: cover; object-position: 78% center; }
.scholarship-hero__proof-card {
  position: absolute;
  z-index: 1;
  right: var(--sp-7);
  bottom: var(--sp-7);
  width: min(260px, calc(100% - 40px));
  padding: var(--sp-6);
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: var(--radius-3);
  background: rgba(13, 17, 22, .82);
  backdrop-filter: blur(14px);
  color: var(--n-000);
}
.scholarship-hero__proof-card strong { display: block; font-size: 52px; line-height: 1; font-weight: var(--fw-black); color: var(--brand-300); }
.scholarship-hero__proof-card span { display: block; margin-top: var(--sp-2); font-size: var(--fs-body-sm); line-height: 1.45; }

.scholarship-section__intro { max-width: 680px; }
.scholarship-section__intro h2,
.scholarship-access h2,
.scholarship-cta h2 {
  margin-top: var(--sp-3);
  font-size: clamp(30px, 4vw, 48px);
  font-weight: var(--fw-black);
  line-height: 1.08;
  letter-spacing: -.03em;
}

.scholarship-benefits {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
  margin: var(--sp-7) 0 0;
  padding: 0;
  list-style: none;
}
.scholarship-benefits li {
  min-width: 0;
  padding: var(--sp-5);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.scholarship-benefits__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-2);
  background: var(--brand-050);
  color: var(--brand-700);
}
.scholarship-benefits p { margin-top: var(--sp-5); font-size: var(--fs-caption); color: var(--text-muted); }
.scholarship-benefits strong { display: block; margin-top: 2px; font-size: var(--fs-h2); line-height: 1.15; color: var(--text-strong); }
.scholarship-benefits small { display: block; margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }
.scholarship-benefits__note { margin-top: var(--sp-4); font-size: var(--fs-caption); color: var(--text-muted); }

.scholarship-access {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  gap: var(--sp-9);
  padding: var(--sp-9);
  border-radius: var(--radius-4);
  background: var(--brand-700);
  color: var(--n-000);
}
.scholarship-kicker--light { color: var(--brand-200); }
.scholarship-access h2 { color: var(--n-000); }
.scholarship-access ul { display: grid; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }
.scholarship-access li {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: rgba(255, 255, 255, .1);
  font-weight: var(--fw-semibold);
}
.scholarship-access li :deep(.gks-icon) { color: var(--brand-200); }

.scholarship-schedule__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-5); margin-top: var(--sp-7); }
.scholarship-schedule__card {
  padding: var(--sp-6);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.scholarship-schedule__card h3 { font-size: var(--fs-h3); font-weight: var(--fw-bold); }
.scholarship-schedule__card dl { display: grid; grid-template-columns: repeat(4, 1fr); margin: var(--sp-5) 0 0; }
.scholarship-schedule__card dl div { min-width: 0; padding: 0 var(--sp-3); border-left: 1px solid var(--line-soft); }
.scholarship-schedule__card dl div:first-child { padding-left: 0; border-left: 0; }
.scholarship-schedule__card dt { font-size: var(--fs-micro); line-height: 1.35; color: var(--text-subtle); }
.scholarship-schedule__card dd { margin: var(--sp-2) 0 0; font-family: var(--font-mono); font-size: var(--fs-label); font-weight: var(--fw-semibold); color: var(--brand-700); }
.scholarship-schedule__note { margin-top: var(--sp-4); font-size: var(--fs-caption); color: var(--text-muted); }
.scholarship-schedule__note a { color: var(--brand-700); }

.scholarship-process ol { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4); margin: var(--sp-7) 0 0; padding: 0; list-style: none; }
.scholarship-process li { display: flex; align-items: flex-start; gap: var(--sp-4); padding-top: var(--sp-5); border-top: 2px solid var(--brand-200); }
.scholarship-process li > span { font-family: var(--font-mono); font-size: var(--fs-caption); color: var(--brand-600); }
.scholarship-process h3 { font-size: var(--fs-body-lg); font-weight: var(--fw-bold); }
.scholarship-process li p { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-muted); }

.scholarship-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-8);
  padding: var(--sp-9);
  overflow: hidden;
  border-radius: var(--radius-4);
  background: var(--ink-900);
}
.scholarship-cta h2 { color: var(--n-000); }

@media (max-width: 980px) {
  .scholarship-hero { grid-template-columns: 1fr; }
  .scholarship-hero__content { padding-bottom: var(--sp-7); }
  .scholarship-hero__proof { min-height: 360px; }
  .scholarship-hero__proof::after { background: linear-gradient(180deg, var(--ink-950) 0%, transparent 38%), linear-gradient(0deg, rgba(13, 17, 22, .6), transparent 55%); }
  .scholarship-benefits { grid-template-columns: repeat(2, 1fr); }
  .scholarship-access { grid-template-columns: 1fr; gap: var(--sp-6); }
  .scholarship-schedule__grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .scholarship-page { gap: var(--sp-9); }
  .scholarship-hero { min-height: 0; border-radius: var(--radius-4); }
  .scholarship-hero__content { padding: var(--sp-8) var(--sp-5) var(--sp-6); }
  .scholarship-hero h1 { font-size: clamp(38px, 12vw, 54px); }
  .scholarship-hero__lead { font-size: var(--fs-body); }
  .scholarship-hero__proof { min-height: 310px; }
  .scholarship-hero__proof-card { right: auto; left: var(--sp-4); bottom: var(--sp-4); padding: var(--sp-5); }
  .scholarship-benefits { grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
  .scholarship-benefits li { padding: var(--sp-4); }
  .scholarship-benefits strong { font-size: var(--fs-h3); }
  .scholarship-access, .scholarship-cta { padding: var(--sp-6) var(--sp-5); }
  .scholarship-access li { align-items: flex-start; }
  .scholarship-schedule__card { padding: var(--sp-5); }
  .scholarship-schedule__card dl { grid-template-columns: 1fr 1fr; gap: var(--sp-4) 0; }
  .scholarship-schedule__card dl div:nth-child(3) { padding-left: 0; border-left: 0; }
  .scholarship-process ol { grid-template-columns: 1fr; }
  .scholarship-cta { align-items: flex-start; flex-direction: column; }
}
</style>
