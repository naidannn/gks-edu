<script setup lang="ts">
defineProps<{
  name: string;
  options: { value: string; label: string; description?: string }[];
  modelValue?: string | null;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div role="radiogroup" class="gks-radio-group">
    <label v-for="o in options" :key="o.value" class="gks-radio">
      <input
        type="radio"
        :name="name"
        class="gks-radio__input"
        :checked="modelValue === o.value"
        @change="$emit('update:modelValue', o.value)"
      >
      <span aria-hidden="true" class="gks-radio__dot" :class="{ 'gks-radio__dot--checked': modelValue === o.value }">
        <span v-if="modelValue === o.value" class="gks-radio__dot-inner" />
      </span>
      <span class="gks-radio__text">
        <span class="gks-radio__label">{{ o.label }}</span>
        <span v-if="o.description" class="gks-radio__description">{{ o.description }}</span>
      </span>
    </label>
  </div>
</template>

<style scoped>
.gks-radio-group { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-radio {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  min-height: var(--control-md);
  padding: var(--sp-2) 0;
  cursor: pointer;
}
.gks-radio__input { position: absolute; opacity: 0; width: 1px; height: 1px; }

.gks-radio__dot {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-top: 2px;
  border: var(--border-hair) solid var(--line-strong);
  background: var(--n-000);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: var(--transition-control);
}
.gks-radio__dot--checked { border-color: var(--brand-600); }
.gks-radio__dot-inner { width: 10px; height: 10px; border-radius: 50%; background: var(--brand-600); }

.gks-radio__text { display: flex; flex-direction: column; gap: 2px; }
.gks-radio__label { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-radio__description { font-size: var(--fs-caption); color: var(--text-muted); }
</style>
