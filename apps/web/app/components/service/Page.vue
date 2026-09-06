<script setup lang="ts">
import type { PublicServicePricing, ServiceType } from '@gks/shared';

/**
 * 1A-10 — the shared shape of the four service pages: hero → what it covers →
 * price → process → who it suits → CTA.
 *
 * Price is **not** a constant here. It is read from `ServicePricing` through
 * the public endpoint (CLAUDE.md: prices are admin configuration), and the
 * price block simply disappears if the business has not configured one yet —
 * an out-of-date number on a public page is worse than no number.
 */
export interface ServiceStep {
  number: string;
  title: string;
  note: string;
}

export interface ServiceInclusion {
  icon: string;
  title: string;
  note: string;
}

const props = defineProps<{
  service: ServiceType;
  eyebrow: string;
  title: string;
  titleAccent: string;
  lead: string;
  /** What the brokerage fee actually buys. */
  inclusions: ServiceInclusion[];
  /** The staged process, in the office's own words. */
  steps: ServiceStep[];
  /** Who the service is for — plain bullets, no marketing adjectives. */
  suitedFor: string[];
  /** Anything the client must know before signing (§5.4 refund terms etc.). */
  conditions: string[];
}>();

const { data: pricing } = await useApiFetch<PublicServicePricing[]>('/pricing/public');

const price = computed(() => pricing.value?.find((row) => row.serviceType === props.service) ?? null);

</script>

<template>
  <div class="svc">
    <section class="svc__hero">
      <p class="svc__eyebrow">{{ eyebrow }}</p>
      <h1 class="svc__title">
        {{ title }}
        <span>{{ titleAccent }}</span>
      </h1>
      <p class="svc__lead">{{ lead }}</p>
      <div class="svc__hero-actions">
        <DsButton
          variant="accent"
          size="lg"
          icon-right="arrow-right"
          @click="navigateTo(`/consultation?service=${service}`)"
        >
          Зөвлөгөө авах
        </DsButton>
        <a href="#process" class="svc__text-link">
          Процесс харах
          <DsIcon name="arrow-down" :size="16" />
        </a>
      </div>
    </section>

    <section class="svc__section">
      <h2 class="svc__h2">Юу багтдаг вэ?</h2>
      <div class="svc__grid">
        <article v-for="item in inclusions" :key="item.title" class="svc__inclusion">
          <DsIcon :name="item.icon" :size="22" />
          <h3 class="svc__inclusion-title">{{ item.title }}</h3>
          <p class="svc__inclusion-note">{{ item.note }}</p>
        </article>
      </div>
    </section>

    <!-- No configured price → no price block, rather than a stale number. -->
    <section v-if="price" class="svc__section svc__price">
      <div>
        <h2 class="svc__h2">Үйлчилгээний хөлс</h2>
        <p class="svc__price-total gks-tnum">{{ formatMntOrDash(price.totalAmount) }}</p>
        <p class="svc__price-note">
          Эхний төлбөр <strong class="gks-tnum">{{ formatMntOrDash(price.prepaymentAmount) }}</strong> —
          үлдэгдлийг гэрээнд заасан үе шатанд төлнө.
        </p>
      </div>
      <ul class="svc__conditions">
        <li v-for="condition in conditions" :key="condition">
          <DsIcon name="check" :size="16" />
          <span>{{ condition }}</span>
        </li>
      </ul>
    </section>

    <section id="process" class="svc__section">
      <h2 class="svc__h2">Процесс</h2>
      <ol class="svc__steps">
        <li v-for="step in steps" :key="step.number" class="svc__step">
          <span class="svc__step-num gks-tnum">{{ step.number }}</span>
          <div>
            <h3 class="svc__step-title">{{ step.title }}</h3>
            <p class="svc__step-note">{{ step.note }}</p>
          </div>
        </li>
      </ol>
    </section>

    <section class="svc__section">
      <h2 class="svc__h2">Хэнд тохирох вэ?</h2>
      <ul class="svc__suited">
        <li v-for="item in suitedFor" :key="item">
          <DsIcon name="check" :size="16" />
          <span>{{ item }}</span>
        </li>
      </ul>
    </section>

    <section class="svc__cta">
      <h2 class="svc__cta-title">Асуух зүйл байна уу?</h2>
      <p class="svc__cta-note">Зөвлөх тантай холбогдож, боломжийг тань үнэлнэ.</p>
      <DsButton
        variant="accent"
        size="lg"
        icon-right="arrow-right"
        @click="navigateTo(`/consultation?service=${service}`)"
      >
        Зөвлөгөө авах
      </DsButton>
    </section>
  </div>
</template>

<style scoped>
.svc { display: flex; flex-direction: column; gap: var(--sp-10); padding-bottom: var(--sp-10); }

.svc__hero { padding: var(--sp-10) 0 0; max-width: 62ch; }
.svc__eyebrow {
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.svc__title { font-family: var(--font-display); font-size: var(--fs-display-2, 40px); font-weight: var(--fw-black); line-height: 1.1; margin: var(--sp-3) 0; }
.svc__title span { display: block; color: var(--brand-600, #1f4e9c); }
.svc__lead { font-size: var(--fs-body-lg, 18px); color: var(--text-subtle); }
.svc__hero-actions { display: flex; align-items: center; gap: var(--sp-4); margin-top: var(--sp-6); flex-wrap: wrap; }
.svc__text-link { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--text-body); text-decoration: none; font-size: var(--fs-body-sm); }
.svc__text-link:hover { color: var(--brand-600); }

.svc__section { display: flex; flex-direction: column; gap: var(--sp-5); }
.svc__h2 { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); }

.svc__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--sp-4); }
.svc__inclusion {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
}
.svc__inclusion-title { font-size: var(--fs-body); font-weight: var(--fw-semibold); }
.svc__inclusion-note { font-size: var(--fs-body-sm); color: var(--text-subtle); }

.svc__price {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-6);
  padding: var(--sp-6);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
}
.svc__price-total { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-black); margin: var(--sp-3) 0 var(--sp-2); }
.svc__price-note { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.svc__conditions,
.svc__suited { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-3); }
.svc__conditions li,
.svc__suited li { display: flex; gap: var(--sp-3); align-items: flex-start; font-size: var(--fs-body-sm); color: var(--text-subtle); }

.svc__steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--sp-5); }
.svc__step { display: flex; gap: var(--sp-4); }
.svc__step-num { font-family: var(--font-mono); font-size: var(--fs-h4, 20px); font-weight: var(--fw-black); color: var(--n-300, #c7c7cc); }
.svc__step-title { font-size: var(--fs-body); font-weight: var(--fw-semibold); }
.svc__step-note { font-size: var(--fs-body-sm); color: var(--text-subtle); }

.svc__cta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-8) var(--sp-5);
  border-radius: var(--radius-lg);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  text-align: center;
}
.svc__cta-title { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); }
.svc__cta-note { font-size: var(--fs-body-sm); color: var(--text-subtle); }

@media (max-width: 720px) {
  .svc__price { grid-template-columns: 1fr; }
  .svc__title { font-size: var(--fs-h2); }
}
</style>
