<script setup lang="ts">
// Canonical URL, Open Graph identity and the default share image, on every
// route — pages override what they need (`app/composables/useSeo.ts`).
useSiteSeo();
</script>

<template>
  <!-- Navigation waits on the page's API calls; the bar is the only thing that
       tells the visitor the click registered (otherwise they click again). -->
  <NuxtLoadingIndicator color="var(--brand-600)" :height="3" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
