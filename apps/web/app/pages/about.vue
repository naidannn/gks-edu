<script setup lang="ts">
/**
 * 1A-33 — Бидний тухай.
 *
 * Every claim on this page is taken from the company's own profile
 * (`docs/GKS_EDU_GROUP_байгууллагын_танилцуулга.docx`) — no invented numbers,
 * no "leading agency in Mongolia". The one figure that appears anywhere on the
 * public site (50+ GKS scholarships) lives on `/gks-scholarship` and is not
 * repeated here.
 *
 * The language school is named as a company activity but linked nowhere: the
 * training centre is a separate brand and is deliberately outside this
 * system's scope (CLAUDE.md, `gksedu.md` §4.4).
 */
const STRENGTHS = [
  {
    icon: 'user-round-check',
    title: 'Сурагч бүртэй тулж ажиллана',
    note: 'Нас, боловсрол, голч дүн, хэлний түвшин, санхүүгийн боломж, зорилгыг нэг бүрчлэн судалж, тухайн хүнд тохирсон боловсролын замыг гаргана.',
  },
  {
    icon: 'layout-dashboard',
    title: 'Бүх явц нэг дороос',
    note: 'Материал, сургууль, тэтгэлэг, элсэлтийн хугацаа, дараагийн хийх ажил — суралцагч бүр өөрийн хувийн буланд бүгдийг нь харна.',
  },
  {
    icon: 'list-checks',
    title: 'Материалыг эхнээс нь дуустал',
    note: 'Жагсаалт гаргах, орчуулга, баталгаажуулалт, анкет, эссэ, сургуульд илгээх, ярилцлагын бэлтгэл — үе шат бүрийг хамтран бэлтгэж, хянана.',
  },
  {
    icon: 'award',
    title: 'Тэтгэлгийг идэвхтэй судална',
    note: 'GKS, сургуулийн төлбөрийн тэтгэлэг, TOPIK болон сурлагын амжилтад суурилсан хөнгөлөлт — таны мэдээлэлд тохирох бүх боломжийг тооцно.',
  },
  {
    icon: 'route',
    title: 'Очсоны дараа ч үргэлжилнэ',
    note: 'Хэлний бэлтгэлээс бакалавр, бакалавраас магистрт шилжих замналаа Монголд ирэлгүйгээр, алсын зайнаас зохион байгуулна.',
  },
  {
    icon: 'map',
    title: '21 аймгаас цахимаар',
    note: 'Онлайнаар зөвлөгөө авч, гэрээ байгуулж, материалаа оруулна. Байршлаас үл хамааран ижил түвшний үйлчилгээ.',
  },
];

const SERVICES = [
  {
    title: 'БНСУ-ын Засгийн газрын тэтгэлэг (GKS)',
    note: 'Боломжийн үнэлгээнээс сургууль сонголт, эссэ, ярилцлагын бэлтгэл, сонгон шалгаруулалтын үе шат, урилга, визний материал хүртэл.',
    to: '/gks-scholarship',
  },
  {
    title: 'Энгийн суралцах зуучлал',
    note: 'Солонгос хэлний бэлтгэл, бакалавр, магистр, доктор. Сургууль сонголтоос виз хүртэлх бүх үе шат.',
    to: '/services/bachelor',
  },
  {
    title: 'Солонгос, Англи хэлний сургалт',
    note: 'Танхим болон онлайн хэлбэрээр, TOPIK болон IELTS-д чиглэсэн бэлтгэл. Тусдаа сургалтын төвөөр зохион байгуулагдана.',
    to: null,
  },
];

const PRINCIPLES = [
  'Сурагч бүртэй тулж ажиллах — нэг загвар бүх хүнд тохирдоггүй.',
  'Нэг бүртгэлд бүх мэдээлэл — материал, сургууль, тэтгэлэг, хугацаа нэг дор.',
  'Монголоос БНСУ хүртэлх нэгдсэн үйлчилгээ — анхны үнэлгээнээс зорчих бэлтгэл хүртэл.',
  'Өнөөдрийн элсэлтээс ирээдүйн боловсрол хүртэл — дараагийн шатыг урьдчилан төлөвлөнө.',
  'Баталгаатай эх сурвалж — сургууль, тэтгэлэг, элсэлтийн мэдээллийг албан ёсны эх сурвалжаас.',
];

useHead({ title: 'Бидний тухай' });
useSeoMeta({
  description:
    'GKS EDU GROUP — Монголын суралцагчдыг БНСУ-ын боловсролтой холбох зуучлалын байгууллага. Бидний ажиллах зарчим, үйлчилгээ, алсын хараа.',
  ogTitle: 'Бидний тухай · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="about">
    <header class="about__head">
      <p class="gks-eyebrow">Бидний тухай</p>
      <h1 class="about__title">Монгол, Солонгосын боловсролыг холбох гүүр.</h1>
      <p class="about__tagline">{{ COMPANY.motto }}</p>
      <p class="about__lede">
        {{ COMPANY.legalName }} нь Монголын сурагч, оюутан, залуучуудыг БНСУ-ын боловсролын
        боломжтой холбож, суралцагч бүрийн зорилго, нөхцөлд тохирсон сургууль, мэргэжил,
        тэтгэлэг болон боловсролын замналыг цогцоор нь төлөвлөн хэрэгжүүлдэг боловсролын
        зуучлалын байгууллага юм.
      </p>
    </header>

    <section class="about__intro">
      <p>
        Суралцагч БНСУ-д суралцах зорилгоо тодорхойлсон үеэс эхлэн бид түүний боловсрол,
        голч дүн, хэлний түвшин, сонгосон мэргэжил, санхүүгийн боломж болон ирээдүйн
        зорилгыг нэг бүрчлэн судалж, хамгийн тохирох сургууль, хөтөлбөр, тэтгэлгийн
        боломжийг тодорхойлно.
      </p>
      <p>
        Сургууль сонгох, элсэлтийн төлөвлөгөө гаргах, материал бүрдүүлэх, анкет бэлтгэх,
        сургуульд илгээх, ярилцлагад бэлтгэх, урилга авах, виз мэдүүлэх, зорчих бэлтгэл
        хийхээс эхлээд дараагийн шатны боловсролоо төлөвлөх хүртэлх бүх үйл явцыг нэг
        уялдаатай системээр зохион байгуулж, ажил бүрийг суралцагчтайгаа хамтран бэлтгэж,
        хянаж ажиллана.
      </p>
    </section>

    <section class="about__section">
      <h2 class="about__h2">Бидний гол давуу тал</h2>
      <ul class="about__strengths">
        <li v-for="item in STRENGTHS" :key="item.title" class="about__strength">
          <span class="about__strength-icon"><DsIcon :name="item.icon" :size="20" /></span>
          <h3 class="about__strength-title">{{ item.title }}</h3>
          <p class="about__strength-note">{{ item.note }}</p>
        </li>
      </ul>
    </section>

    <section class="about__section">
      <h2 class="about__h2">Үндсэн үйлчилгээ</h2>
      <ul class="about__services">
        <li v-for="service in SERVICES" :key="service.title" class="about__service">
          <div>
            <h3 class="about__service-title">{{ service.title }}</h3>
            <p class="about__service-note">{{ service.note }}</p>
          </div>
          <NuxtLink v-if="service.to" :to="service.to" class="about__service-link">
            Дэлгэрэнгүй
            <DsIcon name="arrow-right" :size="15" />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <section class="about__section">
      <h2 class="about__h2">Ажиллах зарчим</h2>
      <ul class="about__principles">
        <li v-for="principle in PRINCIPLES" :key="principle">
          <DsIcon name="circle-check" :size="18" />
          <span>{{ principle }}</span>
        </li>
      </ul>
    </section>

    <section class="about__vision">
      <p class="gks-eyebrow">Алсын хараа</p>
      <p class="about__vision-text">
        Технологи, боловсрол, хүний хөгжлийг нэгтгэсэн шинэ үеийн боловсролын зуучлалын
        системийг Монгол Улсад хөгжүүлж, суралцагч бүрд БНСУ-ын боловсролын боломжийг илүү
        хүртээмжтэй, ойлгомжтой, найдвартай хүргэх.
      </p>
    </section>

    <section class="about__cta">
      <div>
        <h2 class="about__cta-title">Замаа эндээс эхлүүлээрэй.</h2>
        <p class="about__cta-note">
          Зөвлөгөө үнэ төлбөргүй. Таны голч дүн, хэлний түвшин, төсөвт тохирох сургуулиудыг
          хамтдаа харцгаая.
        </p>
      </div>
      <div class="about__cta-actions">
        <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo('/consultation')">
          Зөвлөгөө авах
        </DsButton>
        <NuxtLink to="/contact" class="about__cta-link">Холбоо барих</NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.about { display: flex; flex-direction: column; gap: var(--sp-9); }

.about__head { max-width: var(--container-prose); }
.about__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.about__tagline {
  margin-top: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--brand-600);
}
.about__lede { margin-top: var(--sp-4); color: var(--text-muted); line-height: var(--lh-body); }

.about__intro {
  max-width: var(--container-prose);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  color: var(--text-body);
  line-height: var(--lh-body);
}

.about__section { display: flex; flex-direction: column; gap: var(--sp-5); }
.about__h2 { font-size: var(--fs-h3); font-weight: var(--fw-semibold); }

.about__strengths {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-4);
  list-style: none;
}
.about__strength {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-raised);
}
.about__strength-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-2);
  background: var(--surface-brand-soft);
  color: var(--brand-600);
}
.about__strength-title { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.about__strength-note { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }

.about__services { display: flex; flex-direction: column; list-style: none; }
.about__service {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-5) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.about__service:first-child { border-top: var(--border-hair) solid var(--line-hairline); }
.about__service-title { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.about__service-note {
  margin-top: var(--sp-1);
  max-width: 68ch;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  line-height: var(--lh-body);
}
.about__service-link {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  text-decoration: none;
  white-space: nowrap;
}
.about__service-link:hover { text-decoration: underline; }

.about__principles {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  list-style: none;
}
.about__principles li {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  color: var(--text-body);
  line-height: var(--lh-body);
}
.about__principles .gks-icon { margin-top: 3px; color: var(--brand-600); }

.about__vision {
  padding: var(--sp-7) var(--sp-8);
  border-radius: var(--radius-3);
  background: var(--surface-footer);
  color: var(--n-300);
}
.about__vision .gks-eyebrow { color: var(--brand-300); }
.about__vision-text {
  margin-top: var(--sp-3);
  max-width: var(--container-prose);
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  line-height: var(--lh-heading);
  color: var(--n-000);
}

.about__cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-5);
  padding-top: var(--sp-7);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.about__cta-title { font-size: var(--fs-h3); font-weight: var(--fw-semibold); }
.about__cta-note { margin-top: var(--sp-2); max-width: 56ch; color: var(--text-muted); line-height: var(--lh-body); }
.about__cta-actions { display: flex; align-items: center; gap: var(--sp-5); }
.about__cta-link { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-body); }

@media (max-width: 1024px) {
  .about__strengths { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .about__strengths { grid-template-columns: 1fr; }
  .about__service { flex-direction: column; align-items: flex-start; gap: var(--sp-3); }
  .about__vision { padding: var(--sp-6); }
}
</style>
