<script setup lang="ts">
/**
 * Lucide (ISC, v0.469.0) loaded as a CSS mask so the glyph inherits
 * currentColor. No GKS-drawn icon set was supplied — see the design
 * system readme > ICONOGRAPHY.
 */
const BASE = 'https://unpkg.com/lucide-static@0.469.0/icons/';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: number;
    /** Dims the glyph to 70% opacity — used for de-emphasised icons. */
    light?: boolean;
  }>(),
  { size: 20 },
);

const maskUrl = computed(() => `url("${BASE}${props.name}.svg")`);
</script>

<template>
  <span
    role="img"
    aria-hidden="true"
    :data-icon="name"
    class="gks-icon"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      WebkitMaskImage: maskUrl,
      maskImage: maskUrl,
      opacity: light ? 0.7 : 1,
    }"
  />
</template>

<style scoped>
.gks-icon {
  display: inline-block;
  flex: 0 0 auto;
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-position: center;
  mask-position: center;
}
</style>
