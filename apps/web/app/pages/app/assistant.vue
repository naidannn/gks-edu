<script setup lang="ts">
/**
 * The assistant inside the cabinet (2C-16) — the same screen as `/chat`, in the
 * cabinet's shell, reported as `PORTAL`. A signed-in caller is recognised on
 * every turn, so the answers can draw on their own case rather than the
 * general picture.
 */
definePageMeta({ middleware: 'auth', layout: 'portal', flush: true });
useHead({ title: 'AI зөвлөх' });
</script>

<template>
  <AiChatWorkspace channel="PORTAL" fill />
</template>
