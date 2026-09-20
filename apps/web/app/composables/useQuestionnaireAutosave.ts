import type { QuestionnaireAnswers } from '@gks/shared';

export type AutosaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/** The maps a questionnaire saves: its answers, and on a letter the teacher's details. */
export type AutosaveMaps = Record<string, QuestionnaireAnswers>;

/**
 * Saves a questionnaire while it is being written (1D-27).
 *
 * The form is long and people fill it on a phone, between other things, so
 * there is no "Хадгалах" button to forget: a pause of a second and a half
 * sends whatever changed since the last save. Only the changed answers travel
 * (`answersPatch`), so a questionnaire full of long paragraphs never outgrows a
 * request. A save that fails keeps the text on screen, says so, and goes again
 * on the next keystroke — nothing is ever thrown away on the client's side.
 */
export function useQuestionnaireAutosave(options: {
  /** The live maps being edited. */
  current: () => AutosaveMaps;
  /** Sends the changed keys of each map; resolves when the server has them. */
  save: (patch: AutosaveMaps) => Promise<void>;
  delayMs?: number;
}) {
  const state = ref<AutosaveState>('idle');
  const savedAt = ref<Date | null>(null);
  const errorMessage = ref<string | null>(null);

  let lastSaved: AutosaveMaps = clone(options.current());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;

  /** Resets the baseline — after a load, or after the server answered with its own copy. */
  function reset(maps: AutosaveMaps = options.current()) {
    lastSaved = clone(maps);
    state.value = 'idle';
  }

  function pendingPatch(): AutosaveMaps | null {
    const now = options.current();
    const patch: AutosaveMaps = {};
    for (const [name, map] of Object.entries(now)) {
      const changed = answersPatch(lastSaved[name] ?? {}, map);
      if (Object.keys(changed).length) patch[name] = changed;
    }
    return Object.keys(patch).length ? patch : null;
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight) await inFlight;
    const patch = pendingPatch();
    if (!patch) {
      if (state.value === 'dirty') state.value = 'saved';
      return;
    }

    const sending = clone(options.current());
    state.value = 'saving';
    inFlight = options
      .save(patch)
      .then(() => {
        lastSaved = sending;
        savedAt.value = new Date();
        errorMessage.value = null;
        // Typing may have gone on while the request was out.
        state.value = pendingPatch() ? 'dirty' : 'saved';
        if (state.value === 'dirty') schedule();
      })
      .catch((error: unknown) => {
        state.value = 'error';
        errorMessage.value = apiErrorMessage(error, 'Хадгалж чадсангүй — интернэт холболтоо шалгана уу. Бичсэн зүйл тань устаагүй.');
      })
      .finally(() => {
        inFlight = null;
      });
    await inFlight;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), options.delayMs ?? 1500);
  }

  /** Call on every edit. */
  function touch() {
    if (!pendingPatch()) return;
    state.value = 'dirty';
    schedule();
  }

  const hasUnsaved = computed(() => state.value === 'dirty' || state.value === 'saving' || state.value === 'error');

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!hasUnsaved.value) return;
    event.preventDefault();
    // Chrome still wants a value here to show its own dialog.
    event.returnValue = '';
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    // Leaving the page inside the app: send what is pending rather than lose it.
    if (hasUnsaved.value) void flush();
  });

  return { state, savedAt, errorMessage, hasUnsaved, touch, flush, reset };
}

function clone(maps: AutosaveMaps): AutosaveMaps {
  return Object.fromEntries(Object.entries(maps).map(([name, map]) => [name, { ...map }]));
}
