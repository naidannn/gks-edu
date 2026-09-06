<script setup lang="ts">
/**
 * The catch-all that renders a branded 404 instead of Nuxt's default error page.
 *
 * Because it is a *page*, the server would otherwise answer 200 with "хуудас
 * олдсонгүй" in the body — a soft 404, which a crawler files as a real page and
 * keeps revisiting. The status has to be set by hand for the response to say
 * what the page says.
 */
const event = useRequestEvent();
if (event) setResponseStatus(event, 404);

useHead({ title: 'Олдсонгүй' });
useNoIndex();
</script>

<template>
  <section class="gks-404">
    <p class="gks-404__code gks-tnum">404</p>
    <h1 class="gks-404__title">Хуудас олдсонгүй</h1>
    <DsButton variant="secondary" icon-left="arrow-left" @click="navigateTo('/')">Нүүр хуудас руу</DsButton>
  </section>
</template>

<style scoped>
.gks-404 {
  padding: var(--sp-12) 0;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
}
.gks-404__code { font-size: var(--fs-display-1); font-weight: var(--fw-black); color: var(--n-300); font-family: var(--font-mono); }
.gks-404__title { font-size: var(--fs-h3); font-weight: var(--fw-semibold); }
</style>
