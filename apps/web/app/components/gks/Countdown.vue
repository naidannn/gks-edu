<script setup lang="ts">
import { getAdmissionCountdown } from '~/utils/admissions';

/** Days · hours · minutes · seconds to `to`, ticking with the `now` it is given. */
const props = withDefaults(defineProps<{ to: string; now: number; tone?: 'light' | 'dark' }>(), {
  tone: 'light',
});

const units = computed(() => {
  const left = getAdmissionCountdown(props.to, props.now);
  return [
    { value: left.days, label: 'ХОНОГ' },
    { value: left.hours, label: 'ЦАГ' },
    { value: left.minutes, label: 'МИН' },
    { value: left.seconds, label: 'СЕК' },
  ];
});
</script>

<template>
  <!-- The digits change every second; a screen reader gets the day count once, not a ticker. -->
  <div class="gks-cd" :class="`gks-cd--${tone}`" role="timer" aria-live="off">
    <div v-for="unit in units" :key="unit.label" class="gks-cd__unit">
      <strong class="gks-tnum">{{ String(unit.value).padStart(2, '0') }}</strong>
      <span>{{ unit.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.gks-cd { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); }
.gks-cd__unit {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: var(--sp-3) var(--sp-2);
  border-radius: var(--radius-2);
}
.gks-cd__unit strong { font-size: clamp(26px, 3.4vw, 44px); font-weight: var(--fw-black); line-height: 1.05; letter-spacing: -.02em; }
.gks-cd__unit span { margin-top: 2px; font-family: var(--font-mono); font-size: 10px; font-weight: var(--fw-semibold); letter-spacing: var(--ls-caps); }

.gks-cd--light .gks-cd__unit { border: 1px solid var(--line-soft); background: var(--n-025); }
.gks-cd--light strong { color: var(--cd-fg, var(--brand-700)); }
.gks-cd--light span { color: var(--text-subtle); }

.gks-cd--dark .gks-cd__unit { border: 1px solid rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .06); }
.gks-cd--dark strong { color: var(--cd-fg, var(--n-000)); }
.gks-cd--dark span { color: var(--n-400); }
</style>
