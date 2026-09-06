<script setup lang="ts">
/**
 * The filter bar the three public catalogues share (universities, admissions,
 * programmes).
 *
 * A phone used to open these pages on six or eight stacked selects: the first
 * card sat a screen and a half down, so the page read as "search first, and
 * only then will anything appear". Here the search field is the only control
 * on the opening row and everything else lives in a panel that is collapsed on
 * a phone and always open from 720px up — the same markup, two behaviours, no
 * duplicated filter set.
 *
 * The count line sits below the card rather than inside it, because its job is
 * no longer only to report a number: on a phone it is the one thing that says
 * a list is already waiting further down. Its arrow stops moving as soon as
 * the visitor scrolls, which is the moment the hint has done its work.
 */
withDefaults(
  defineProps<{
    search: string;
    searchPlaceholder: string;
    /** Accessible name for the search field — the placeholder is not one. */
    searchLabel: string;
    /** How many panel controls are set; badges the toggle on a phone. */
    activeCount?: number;
    /** Rows matched. Ignored while `loading`. */
    count: number;
    /** "сургууль" / "элсэлт" / "хөтөлбөр" — the noun the count is counting. */
    countNoun: string;
    /** First load, before any row is known. */
    loading?: boolean;
    /** The list failed to load — the page says so itself, the cue stays out. */
    failed?: boolean;
    /** Shows "Шүүлтүүр цэвэрлэх"; the search box counts as a filter. */
    canClear?: boolean;
  }>(),
  { activeCount: 0 },
);

const emit = defineEmits<{ 'update:search': [value: string]; clear: [] }>();

const open = ref(false);
const panelId = useId();

/** The arrow invites a scroll exactly once; after that it is just a count. */
const scrolled = ref(false);
onMounted(() => {
  const stop = () => {
    scrolled.value = true;
  };
  window.addEventListener('scroll', stop, { passive: true, once: true });
  onBeforeUnmount(() => window.removeEventListener('scroll', stop));
});
</script>

<template>
  <div class="gks-fbar">
    <DsCard padding="var(--sp-4)">
      <div class="gks-fbar__row">
        <div class="gks-fbar__search">
          <DsInput
            type="search"
            icon-left="search"
            :model-value="search"
            :placeholder="searchPlaceholder"
            :aria-label="searchLabel"
            @update:model-value="emit('update:search', $event)"
          />
        </div>
        <button
          type="button"
          class="gks-fbar__toggle"
          :class="{ 'gks-fbar__toggle--on': open }"
          :aria-expanded="open"
          :aria-controls="panelId"
          @click="open = !open"
        >
          <DsIcon name="sliders-horizontal" :size="18" />
          <span>Шүүлтүүр</span>
          <span v-if="activeCount" class="gks-fbar__count">{{ activeCount }}</span>
          <DsIcon class="gks-fbar__caret" name="chevron-down" :size="16" />
        </button>
      </div>

      <div :id="panelId" class="gks-fbar__panel" :class="{ 'gks-fbar__panel--open': open }">
        <div class="gks-fbar__grid"><slot /></div>
        <slot name="extra" />
      </div>

      <div v-if="canClear" class="gks-fbar__foot">
        <DsButton variant="ghost" size="sm" icon-left="x" @click="emit('clear')">
          Шүүлтүүр цэвэрлэх
        </DsButton>
      </div>
    </DsCard>

    <!-- Nothing found is the empty card's line to say; repeating it here
         would put the same sentence on the screen twice. -->
    <p
      v-if="!failed && (loading || count)"
      class="gks-fbar__cue"
      :class="{ 'gks-fbar__cue--still': scrolled }"
      aria-live="polite"
    >
      <template v-if="loading">Ачаалж байна…</template>
      <template v-else>
        Доорх жагсаалтад <strong class="gks-tnum">{{ count }}</strong> {{ countNoun }} байна
        <DsIcon class="gks-fbar__arrow" name="arrow-down" :size="15" />
      </template>
    </p>
  </div>
</template>

<style scoped>
.gks-fbar { display: grid; gap: var(--sp-3); }

.gks-fbar__row { display: flex; align-items: center; gap: var(--sp-3); }
.gks-fbar__search { flex: 1; min-width: 0; }

/* The toggle exists only where the panel can be closed. */
.gks-fbar__toggle { display: none; }
.gks-fbar__caret { transition: transform var(--dur-fast) var(--ease-standard); }

.gks-fbar__panel { margin-top: var(--sp-3); display: grid; gap: var(--sp-3); }
.gks-fbar__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: var(--sp-3);
}

.gks-fbar__foot { display: flex; justify-content: flex-end; margin-top: var(--sp-3); }

.gks-fbar__cue {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}
.gks-fbar__cue strong { color: var(--text-strong); }
.gks-fbar__arrow { animation: gks-fbar-nudge 1.6s ease-in-out 3; }
.gks-fbar__cue--still .gks-fbar__arrow { animation: none; }
@keyframes gks-fbar-nudge {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(3px); }
}
@media (prefers-reduced-motion: reduce) {
  .gks-fbar__arrow { animation: none; }
}

@media (max-width: 720px) {
  .gks-fbar__toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    flex: none;
    min-height: var(--control-md);
    padding: 0 var(--sp-3);
    border: var(--border-hair) solid var(--line-strong);
    border-radius: var(--radius-2);
    background: var(--n-000);
    color: var(--text-body);
    font-family: var(--font-sans);
    font-size: var(--fs-label);
    font-weight: var(--fw-semibold);
    cursor: pointer;
  }
  .gks-fbar__toggle--on { border-color: var(--line-ink); }
  .gks-fbar__toggle--on .gks-fbar__caret { transform: rotate(180deg); }
  .gks-fbar__count {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--ink-800);
    color: var(--text-inverse);
    font-size: var(--fs-micro);
    font-variant-numeric: var(--num-tabular);
  }

  .gks-fbar__panel { grid-template-columns: 1fr; }
  .gks-fbar__panel:not(.gks-fbar__panel--open) { display: none; }
  .gks-fbar__grid { grid-template-columns: 1fr; }
}
</style>
