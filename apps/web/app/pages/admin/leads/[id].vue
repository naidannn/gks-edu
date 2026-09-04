<script setup lang="ts">
/** Legacy route — see `/admin/consultations/:id`. */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
await navigateTo({ path: `/admin/consultations/${route.params.id}`, query: route.query }, { replace: true });
</script>

<template>
  <div />
</template>
