<template>
  <!-- Navigation waits on the page's API calls; the bar is the only thing that
       tells the visitor the click registered (otherwise they click again). -->
  <NuxtLoadingIndicator color="var(--brand-600)" :height="3" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
