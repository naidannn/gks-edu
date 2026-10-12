<script setup lang="ts">
/**
 * The assistant, full size, on the public site (2C-02, 2C-13). The screen
 * itself is `AiChatWorkspace`, shared with the cabinet's `/app/assistant`.
 *
 * `noindex, nofollow`, and disallowed in `robots.txt` besides. A conversation is
 * not a landing page: it has no stable content, and an indexed one would put a
 * half-answered question in a search result. Both are needed — `robots.txt`
 * stops the crawl, and only the meta tag stops an inbound link from putting the
 * URL in an index anyway.
 */
definePageMeta({ layout: 'default' });
useNoIndex();
useHead({ title: 'AI зөвлөх' });
</script>

<template>
  <AiChatWorkspace channel="WEB_WIDGET" />
</template>
