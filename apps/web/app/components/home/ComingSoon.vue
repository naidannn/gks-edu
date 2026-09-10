<script setup lang="ts">
/**
 * "Coming soon" teaser on the landing page: the phase-2 AI assistant and the
 * phase-4 mobile apps (`docs/ROADMAP.md`). Every claim here is one the plan
 * already commits to (`docs/AI-ASSISTANT.md` §1, §6) — no dates, no numbers we
 * do not yet have — so the block can stay up until the features ship.
 */
const UPCOMING = [
  {
    key: 'ai',
    icon: 'bot',
    stage: 'Хөгжүүлж байна',
    title: 'AI зөвлөх туслах',
    text: 'Асуултад тань 24/7 хариулж, танд тохирох сургууль, хугацаа, зардлыг тооцоолж, зөвлөхтэй холбоно.',
    points: [
      { icon: 'clock', text: 'Өдөр, шөнөгүй — ямар ч цагт хариу авах' },
      { icon: 'shield-check', text: 'Үнэ, хугацаа зөвхөн бодит мэдээллийн сангаас' },
      { icon: 'user-check', text: 'Хэрэгтэй үед хүн зөвлөх рүү шууд шилжүүлнэ' },
    ],
  },
  {
    key: 'app',
    icon: 'smartphone',
    stage: 'Удахгүй',
    title: 'iOS · Android апп',
    text: 'Материал, төлбөр, визний явцаа гар утаснаасаа хянаж, зөвлөхтэйгөө нэг товшилтоор холбогдоно.',
    points: [
      { icon: 'bell-ring', text: 'Хугацаа дөхөхөд шууд мэдэгдэл' },
      { icon: 'upload', text: 'Материалаа зургаар авч шууд илгээх' },
      { icon: 'messages-square', text: 'Зөвлөхтэйгөө чат — вэбтэй нэг цонх' },
    ],
  },
] as const;
</script>

<template>
  <section class="gks-soon" aria-labelledby="gks-soon-title">
    <div class="gks-soon__head">
      <span class="gks-soon__eyebrow">
        <DsIcon name="sparkles" :size="14" />
        Тун удахгүй
      </span>
      <h2 id="gks-soon-title" class="gks-soon__heading">Таны Солонгост сурах зам — халаасанд</h2>
      <p class="gks-soon__lede">
        Бид үйлчилгээгээ таны гар утас, таны цаг тухайд хүргэхээр хөгжүүлж байна.
        Бүртгэлтэй хэрэглэгчид шинэ боломжийг хамгийн түрүүнд хүлээн авна.
      </p>
    </div>

    <ul class="gks-soon__grid">
      <li v-for="item in UPCOMING" :key="item.key" class="gks-soon__card" :class="`gks-soon__card--${item.key}`">
        <div class="gks-soon__card-head">
          <span class="gks-soon__icon"><DsIcon :name="item.icon" :size="24" /></span>
          <DsBadge tone="info" icon="loader-circle">{{ item.stage }}</DsBadge>
        </div>
        <h3 class="gks-soon__title">{{ item.title }}</h3>
        <p class="gks-soon__text">{{ item.text }}</p>
        <ul class="gks-soon__points">
          <li v-for="point in item.points" :key="point.text">
            <DsIcon :name="point.icon" :size="16" />
            <span>{{ point.text }}</span>
          </li>
        </ul>

        <div v-if="item.key === 'app'" class="gks-soon__stores" aria-label="Апп дэлгүүрүүд">
          <span class="gks-soon__store"><DsIcon name="smartphone" :size="14" /> App Store · удахгүй</span>
          <span class="gks-soon__store"><DsIcon name="smartphone" :size="14" /> Google Play · удахгүй</span>
        </div>
        <div v-else class="gks-soon__preview" aria-hidden="true">
          <span class="gks-soon__bubble gks-soon__bubble--user">Хэлний бэлтгэлд 3 сард элсэхэд хэзээ бүртгүүлэх вэ?</span>
          <span class="gks-soon__bubble gks-soon__bubble--ai">
            <DsIcon name="sparkles" :size="12" />
            Дотоод хугацаа тань 12 сарын дунд. Одоо эхэлбэл материал бүрдүүлэх бүтэн 2 сар байна…
          </span>
        </div>
      </li>
    </ul>

    <p class="gks-soon__foot">
      <DsIcon name="info" :size="14" />
      Гарсан даруйд энэ хуудас, и-мэйл болон кабинетаараа мэдэгдэнэ.
      <NuxtLink to="/register">Бүртгүүлж эхэлж мэдэх</NuxtLink>
    </p>
  </section>
</template>

<style scoped>
.gks-soon {
  position: relative;
  padding: var(--sp-8);
  border-radius: var(--radius-4);
  border: var(--border-hair) solid var(--brand-100);
  background:
    radial-gradient(60% 80% at 100% 0%, var(--brand-100) 0%, transparent 60%),
    var(--surface-wash);
  overflow: hidden;
}
.gks-soon__head { max-width: 62ch; }
.gks-soon__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
}
.gks-soon__heading {
  margin-top: var(--sp-4);
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
  color: var(--text-strong);
}
.gks-soon__lede {
  margin-top: var(--sp-3);
  color: var(--text-muted);
  line-height: var(--lh-body);
}

.gks-soon__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp-5);
  margin: var(--sp-7) 0 0;
  padding: 0;
  list-style: none;
}
.gks-soon__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-6);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-raised);
}
.gks-soon__card-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-soon__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-2);
  background: var(--brand-100);
  color: var(--brand-700);
}
.gks-soon__title { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-soon__text { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--text-muted); }
.gks-soon__points {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: var(--sp-1) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-body-sm);
}
.gks-soon__points li { display: flex; align-items: flex-start; gap: var(--sp-2); color: var(--text-strong); }
.gks-soon__points li .gks-icon { flex: none; margin-top: 2px; color: var(--brand-600); }

/* Chat preview — an illustration of the tone, not a live widget. */
.gks-soon__preview {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-top: auto;
  padding-top: var(--sp-4);
  border-top: var(--border-hair) dashed var(--line-soft);
}
.gks-soon__bubble {
  max-width: 88%;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-3);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}
.gks-soon__bubble--user {
  align-self: flex-end;
  background: var(--n-100);
  color: var(--text-strong);
  border-bottom-right-radius: 4px;
}
.gks-soon__bubble--ai {
  display: inline-flex;
  gap: 6px;
  align-self: flex-start;
  background: var(--brand-050);
  border: var(--border-hair) solid var(--brand-100);
  color: var(--brand-700);
  border-bottom-left-radius: 4px;
}
.gks-soon__bubble--ai .gks-icon { flex: none; margin-top: 3px; }

.gks-soon__stores { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: auto; padding-top: var(--sp-4); border-top: var(--border-hair) dashed var(--line-soft); }
.gks-soon__store {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px var(--sp-3);
  border-radius: var(--radius-pill);
  background: var(--ink-800);
  color: var(--text-inverse);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  white-space: nowrap;
}

.gks-soon__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: var(--sp-6);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-soon__foot .gks-icon { flex: none; }
.gks-soon__foot a { color: var(--brand-600); font-weight: var(--fw-semibold); }

@media (max-width: 640px) {
  .gks-soon { padding: var(--sp-6); }
}
</style>
