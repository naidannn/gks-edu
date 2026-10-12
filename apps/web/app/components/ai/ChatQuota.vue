<script setup lang="ts">
import type { AiGuestAllowance } from '@gks/shared';

/**
 * "N үнэгүй асуулт үлдлээ" above the composer (2C-15).
 *
 * Said from the first screen, not only at the end: a limit somebody learns
 * about when they hit it reads as a trap, and the same limit counted down
 * reads as a trial. Nothing is drawn for somebody signed in, or while the
 * sign-up card is already on screen saying the same thing louder.
 */
const props = defineProps<{ guest: AiGuestAllowance | null; held?: string | null }>();

const route = useRoute();

const visible = computed(() => Boolean(props.guest && props.guest.limit > 0 && !props.held));
</script>

<template>
  <p v-if="visible && guest" class="gks-chat-quota" :class="{ 'gks-chat-quota--last': guest.remaining <= 1 }">
    <DsIcon name="sparkles" :size="13" />
    <span v-if="guest.remaining > 0">
      <strong class="gks-tnum">{{ guest.remaining }}</strong> үнэгүй асуулт үлдлээ
    </span>
    <span v-else>Үнэгүй асуултууд дууслаа</span>
    <span aria-hidden="true">·</span>
    <NuxtLink :to="{ path: '/register', query: { redirect: route.fullPath } }">Бүртгүүлбэл хязгааргүй</NuxtLink>
  </p>
</template>

<style scoped>
.gks-chat-quota {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 6px var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-chat-quota .gks-icon { color: var(--brand-500); }
.gks-chat-quota strong { color: var(--text-strong); }
.gks-chat-quota a { color: var(--brand-600); font-weight: var(--fw-semibold); }
.gks-chat-quota--last strong { color: var(--brand-700); }
</style>
