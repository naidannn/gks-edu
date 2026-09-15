<script setup lang="ts">
import QRCode from 'qrcode';
import logoFull from '~/assets/img/gks-logo-full.png';

/**
 * The poster for the office wall (1B-21): a QR code that opens `/visit`, where
 * a waiting visitor registers themselves. Printed from here rather than kept as
 * an image file, so the code always points at the site this build serves.
 *
 * No admin layout — the page *is* the printout, and the sidebar would print too.
 */
definePageMeta({ middleware: 'staff', layout: false });

const visitUrl = `${useSiteUrl()}/visit`;
const svg = ref('');

onMounted(async () => {
  // High error correction: a poster on a wall gets scuffed and photographed at an angle.
  svg.value = await QRCode.toString(visitUrl, { type: 'svg', errorCorrectionLevel: 'H', margin: 0 });
});

function print() {
  window.print();
}

useHead({ title: 'Оффисын QR · CRM' });
</script>

<template>
  <div class="gks-qr">
    <nav class="gks-qr__toolbar">
      <NuxtLink to="/admin/consultations" class="gks-qr__back">
        <DsIcon name="arrow-left" :size="16" /> Зөвлөгөө хүсэлт
      </NuxtLink>
      <DsButton variant="accent" icon-left="printer" @click="print">Хэвлэх</DsButton>
    </nav>

    <main class="gks-qr__poster">
      <img :src="logoFull" alt="GKS EDU GROUP" class="gks-qr__logo">
      <h1 class="gks-qr__title">Зөвлөгөө авах гэж ирсэн үү?</h1>
      <p class="gks-qr__lede">
        Хүлээж байх хооронд утсаараа QR кодыг уншуулж, мэдээллээ бүртгүүлээрэй.
      </p>
      <!-- eslint-disable-next-line vue/no-v-html -- SVG generated locally from our own URL -->
      <div v-if="svg" class="gks-qr__code" role="img" :aria-label="`QR код: ${visitUrl}`" v-html="svg" />
      <div v-else class="gks-qr__code gks-qr__code--pending" />
      <p class="gks-qr__steps">
        1. Камераа QR код руу чиглүүлнэ &nbsp;·&nbsp; 2. Мэдээллээ бөглөнө &nbsp;·&nbsp; 3. Зөвлөх тантай уулзана
      </p>
      <p class="gks-qr__url">{{ visitUrl.replace(/^https?:\/\//, '') }}</p>
    </main>
  </div>
</template>

<style scoped>
.gks-qr {
  min-height: 100vh;
  padding: var(--sp-4);
  background: var(--surface-page, #fff);
}

.gks-qr__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 720px;
  margin: 0 auto var(--sp-6);
}
.gks-qr__back { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); }

.gks-qr__poster {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-5);
  max-width: 720px;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-6);
  text-align: center;
  background: #fff;
  border: var(--border-hair) solid var(--line-hairline);
}
.gks-qr__logo { height: 56px; width: auto; }
.gks-qr__title {
  font-family: var(--font-display);
  font-size: clamp(1.75rem, 5vw, 2.75rem);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
  color: #111;
}
.gks-qr__lede { max-width: 32ch; font-size: 1.25rem; line-height: var(--lh-body); color: #333; }
.gks-qr__code { width: min(100%, 360px); aspect-ratio: 1; }
.gks-qr__code :deep(svg) { display: block; width: 100%; height: 100%; }
.gks-qr__code--pending { background: var(--surface-sunken); }
.gks-qr__steps { font-size: 1rem; color: #333; }
.gks-qr__url { font-size: 1.125rem; font-weight: var(--fw-semibold); color: #111; letter-spacing: 0.02em; }

@media print {
  @page { size: A4 portrait; margin: 15mm; }
  .gks-qr { min-height: 0; padding: 0; background: #fff; }
  .gks-qr__toolbar { display: none; }
  .gks-qr__poster { border: 0; padding: 0; max-width: none; gap: 8mm; }
  .gks-qr__code { width: 110mm; }
}
</style>
