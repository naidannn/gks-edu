<script setup lang="ts">
/**
 * A select you can type into.
 *
 * `DsSelect` is a native `<select>`, which is right for a handful of options
 * and wrong for 135 Korean universities: staff were scrolling the list to find
 * one school. This keeps the same props as `DsSelect` — so a call site swaps
 * one tag for another — and adds a filter over `label`, `sub` and `keywords`.
 *
 * Search is by whitespace-separated terms, all of which must match somewhere,
 * so "kyung сөүл" narrows the same way a person expects it to.
 */
interface ComboboxOption {
  value: string;
  label: string;
  /** The quieter second line — a Mongolian name, a city. Searchable. */
  sub?: string;
  /** Extra text to match on that is never displayed (a Korean name, a code). */
  keywords?: string;
}

const props = defineProps<{
  label?: string;
  hint?: string;
  error?: string;
  options: ComboboxOption[];
  modelValue?: string | null;
  disabled?: boolean;
  /** Shown while the option list is still being fetched. */
  loading?: boolean;
  placeholder?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const inputId = useId();
const listId = `${inputId}-list`;

const open = ref(false);
const query = ref('');
const active = ref(0);
const root = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const list = ref<HTMLElement | null>(null);

const selected = computed(() => props.options.find((option) => option.value === props.modelValue) ?? null);

const matches = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return props.options;

  return props.options.filter((option) => {
    const haystack = `${option.label} ${option.sub ?? ''} ${option.keywords ?? ''}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
});

/**
 * Closed, the field reads as a select: it shows what is chosen. Open, it is a
 * search box, and the chosen row is what the placeholder reminds you of.
 */
const shown = computed(() => (open.value ? query.value : (selected.value?.label ?? '')));
const placeholder = computed(() => {
  if (props.loading) return 'Ачаалж байна…';
  if (open.value && selected.value) return selected.value.label;
  return props.placeholder ?? 'Хайх юм уу сонгоно уу';
});

function openList() {
  if (props.disabled || props.loading) return;
  open.value = true;
  query.value = '';
  active.value = Math.max(0, matches.value.findIndex((option) => option.value === props.modelValue));
}

function close() {
  open.value = false;
  query.value = '';
}

function choose(option: ComboboxOption | undefined) {
  if (!option) return;
  emit('update:modelValue', option.value);
  close();
  input.value?.blur();
}

function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value;
  open.value = true;
  active.value = 0;
}

function move(step: number) {
  if (!open.value) return openList();
  const count = matches.value.length;
  if (!count) return;
  active.value = (active.value + step + count) % count;
}

function onKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      move(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      move(-1);
      break;
    case 'Enter':
      if (!open.value) return;
      event.preventDefault();
      choose(matches.value[active.value]);
      break;
    case 'Escape':
      if (!open.value) return;
      event.preventDefault();
      close();
      break;
    case 'Tab':
      close();
      break;
  }
}

// Keep the highlighted row in view when the keyboard is doing the walking.
watch(active, async () => {
  if (!open.value) return;
  await nextTick();
  list.value?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
});

function onPointerDown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close();
}

onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
  <div ref="root" class="gks-field gks-combo">
    <label v-if="label" :for="inputId" class="gks-field__label">{{ label }}</label>

    <!-- The chevron and the padding are part of the target: clicking anywhere
         on the field opens the list, the way a native select does. -->
    <div
      class="gks-field__control gks-combo__control"
      :class="{ 'gks-field__control--error': error, 'gks-field__control--disabled': disabled || loading }"
      @click="input?.focus()"
    >
      <DsIcon name="search" :size="18" class="gks-field__icon" />
      <input
        :id="inputId"
        ref="input"
        class="gks-field__input"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="open && matches[active] ? `${listId}-${active}` : undefined"
        :disabled="disabled || loading"
        :value="shown"
        :placeholder="placeholder"
        @input="onInput"
        @focus="openList"
        @keydown="onKeydown"
      >
      <DsIcon name="chevron-down" :size="18" class="gks-field__icon gks-combo__chevron" />
    </div>

    <ul v-if="open" :id="listId" ref="list" class="gks-combo__list" role="listbox">
      <li
        v-for="(option, index) in matches"
        :id="`${listId}-${index}`"
        :key="option.value"
        class="gks-combo__option"
        :class="{ 'gks-combo__option--active': index === active }"
        :data-active="index === active"
        role="option"
        :aria-selected="option.value === modelValue"
        @mouseenter="active = index"
        @click="choose(option)"
      >
        <span class="gks-combo__label">{{ option.label }}</span>
        <span v-if="option.sub" class="gks-combo__sub">{{ option.sub }}</span>
        <DsIcon v-if="option.value === modelValue" name="check" :size="16" class="gks-combo__check" />
      </li>
      <li v-if="!matches.length" class="gks-combo__empty">Олдсонгүй</li>
    </ul>

    <span v-if="error || hint" class="gks-field__note" :class="{ 'gks-field__note--error': error }">
      <DsIcon v-if="error" name="triangle-alert" :size="14" />{{ error || hint }}
    </span>
  </div>
</template>

<style scoped>
.gks-field { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-field__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
  letter-spacing: var(--ls-label);
}

.gks-combo { position: relative; }
.gks-field__control {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: var(--control-md);
  padding: 0 var(--sp-4);
  background: var(--n-000);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  transition: var(--transition-control);
}
.gks-field__control:focus-within { border-color: var(--brand-600); box-shadow: inset 0 0 0 1px var(--brand-600); }
.gks-field__control--error { border-color: var(--red-700); }
.gks-field__control--disabled { background: var(--n-050); }
.gks-combo__control { cursor: text; }

.gks-field__icon { color: var(--text-subtle); flex: none; }
.gks-combo__chevron { color: var(--text-muted); }
.gks-field__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  padding: var(--field-pad-y) 0;
  font-size: var(--fs-body);
  font-family: var(--font-sans);
  color: var(--text-body);
  text-overflow: ellipsis;
}
.gks-field__input:disabled { color: var(--text-disabled); }

.gks-combo__list {
  position: absolute;
  top: calc(100% - var(--sp-5));
  left: 0;
  right: 0;
  z-index: 30;
  margin: var(--sp-1) 0 0;
  padding: var(--sp-1);
  max-height: 18rem;
  overflow-y: auto;
  list-style: none;
  background: var(--n-000);
  border-radius: var(--radius-2);
  box-shadow: var(--shadow-menu);
}
.gks-combo__option {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0 var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-1);
  cursor: pointer;
}
.gks-combo__option--active { background: var(--n-050); }
.gks-combo__label { font-size: var(--fs-body); color: var(--text-body); }
.gks-combo__sub {
  grid-column: 1;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-combo__check { grid-row: 1 / span 2; color: var(--brand-600); }
.gks-combo__empty { padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-muted); }

.gks-field__note { display: flex; align-items: center; gap: 6px; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-field__note--error { color: var(--red-800); }
</style>
