<script setup lang="ts">
/**
 * Legacy route. Leads are called "Зөвлөгөө хүсэлт" in the CRM now and live at
 * `/admin/consultations`; bookmarks and older links keep working through here.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

await navigateTo({ path: '/admin/consultations', query: useRoute().query }, { replace: true });
</script>

<template>
  <div />
</template>
