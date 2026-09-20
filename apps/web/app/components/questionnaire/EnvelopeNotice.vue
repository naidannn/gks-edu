<script setup lang="ts">
/**
 * The one instruction the office's recommendation guide shouts about: the
 * teacher signs across the flap, and nobody seals the envelope — the office
 * checks the letter first and seals it itself. A picture, because "дугтуйн
 * арын наадаг амсар дээгүүр" is hard to follow in words alone.
 */
defineProps<{ compact?: boolean }>();
</script>

<template>
  <div class="gks-env" :class="{ 'gks-env--compact': compact }" role="note">
    <svg class="gks-env__art" viewBox="0 0 160 110" aria-hidden="true">
      <rect x="8" y="30" width="144" height="72" rx="4" class="gks-env__body" />
      <path d="M8 34 L80 6 L152 34" class="gks-env__flap" />
      <path d="M8 34 L80 72 L152 34" class="gks-env__fold" />
      <path d="M52 40 C60 30, 66 50, 74 38 S88 30, 94 44 S104 36, 110 40" class="gks-env__sign" />
      <circle cx="136" cy="18" r="13" class="gks-env__no" />
      <path d="M127 9 L145 27" class="gks-env__no-line" />
    </svg>
    <div class="gks-env__text">
      <p class="gks-env__title">Дугтуйг битгий нааж, битүүмжлээрэй</p>
      <p>
        Гарын үсэг зурсан тодорхойлолтыг дугтуйнд хийж, дугтуйн <strong>арын амсар дээгүүр багшаар гарын үсэг зуруулна</strong>.
        Гэхдээ дугтуйг <strong>нээлттэй</strong> хэвээр нь оффист эх хувиар нь авчирна — бид агуулга, огноо, гарын үсгийг шалгаад
        өөрсдөө битүүмжилнэ.
      </p>
    </div>
  </div>
</template>

<style scoped>
.gks-env {
  display: flex;
  gap: var(--sp-5);
  align-items: center;
  padding: var(--sp-4) var(--sp-5);
  border: var(--border-hair) solid var(--danger-line);
  border-left: var(--border-rail) solid var(--red-700);
  border-radius: var(--radius-2);
  background: var(--danger-bg);
}
.gks-env__art { flex-shrink: 0; width: 120px; height: auto; }
.gks-env__body { fill: var(--n-000); stroke: var(--n-500); stroke-width: 2; }
.gks-env__flap { fill: var(--n-050); stroke: var(--n-500); stroke-width: 2; stroke-linejoin: round; }
.gks-env__fold { fill: none; stroke: var(--n-300); stroke-width: 1.5; }
.gks-env__sign { fill: none; stroke: var(--brand-700); stroke-width: 2.5; stroke-linecap: round; }
.gks-env__no { fill: var(--n-000); stroke: var(--red-700); stroke-width: 3; }
.gks-env__no-line { stroke: var(--red-700); stroke-width: 3; }
.gks-env__text { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-body); line-height: var(--lh-body); }
.gks-env__title { font-weight: var(--fw-bold); color: var(--danger-fg); font-size: var(--fs-body); }
.gks-env--compact .gks-env__art { width: 84px; }
@media (max-width: 600px) {
  .gks-env { flex-direction: column; align-items: flex-start; }
}
</style>
