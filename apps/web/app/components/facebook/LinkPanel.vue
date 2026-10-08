<script setup lang="ts">
import type { FacebookLinkCandidate, FacebookThreadDetail, FacebookThreadItem, LeadStage } from '@gks/shared';

/**
 * Tying a Messenger contact to the CRM (2F).
 *
 * A Facebook name is not a person we know: "Bat Erdene" in Messenger may be a
 * lead the office registered last week, a client under contract, or nobody yet.
 * So the panel offers both directions — find the existing record by name or
 * phone and link it, or open a lead from the thread when there is none. The
 * phone the assistant already noted is the best hint we have, so the lead form
 * starts from it.
 */
const props = defineProps<{ thread: FacebookThreadDetail }>();

const emit = defineEmits<{ changed: [thread: FacebookThreadItem]; close: [] }>();

const api = useApi();

const mode = ref<'link' | 'lead'>('link');
const search = ref('');
const candidates = ref<FacebookLinkCandidate[]>([]);
const searching = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;
/** A slow answer to an older query must not replace a newer one's. */
let latest = 0;

watch(search, (value) => {
  if (timer) clearTimeout(timer);
  const term = value.trim();
  if (term.length < 2) {
    candidates.value = [];
    return;
  }
  timer = setTimeout(() => void find(term), 300);
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

async function find(term: string): Promise<void> {
  const run = ++latest;
  searching.value = true;
  error.value = null;
  try {
    const result = await api.get<FacebookLinkCandidate[]>(
      `/admin/facebook/link-candidates?${new URLSearchParams({ search: term })}`,
    );
    if (run === latest) candidates.value = result;
  } catch (e) {
    if (run === latest) error.value = apiErrorMessage(e, 'Хайлт амжилтгүй боллоо');
  } finally {
    if (run === latest) searching.value = false;
  }
}

async function patchLink(body: { leadId?: string | null; clientId?: string | null }): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const next = await api.patch<FacebookThreadItem>(`/admin/facebook/threads/${props.thread.id}/link`, body);
    emit('changed', next);
    search.value = '';
  } catch (e) {
    error.value = apiErrorMessage(e, 'Холбож чадсангүй');
  } finally {
    busy.value = false;
  }
}

function link(candidate: FacebookLinkCandidate): void {
  void patchLink(candidate.kind === 'LEAD' ? { leadId: candidate.id } : { clientId: candidate.id });
}

/** Already tied to this exact record — offering "Холбох" again would be a no-op. */
function isLinked(candidate: FacebookLinkCandidate): boolean {
  return candidate.kind === 'LEAD' ? props.thread.lead?.id === candidate.id : props.thread.client?.id === candidate.id;
}

function candidateDetail(candidate: FacebookLinkCandidate): string | null {
  if (!candidate.detail) return null;
  if (candidate.kind === 'LEAD') return LEAD_STAGE_LABELS[candidate.detail as LeadStage] ?? candidate.detail;
  return candidate.detail;
}

// ── New lead from the thread ─────────────────────────────────────────────────

/**
 * Facebook writes a name the Western way round — given name first — while a
 * lead stores овог and нэр apart. The first word is taken as the given name
 * and the rest as the family name; staff correct it when it guessed wrong.
 */
function splitName(name: string | null): { firstName: string; lastName: string } {
  const words = (name ?? '').trim().split(/\s+/u).filter(Boolean);
  return { firstName: words[0] ?? '', lastName: words.slice(1).join(' ') };
}

function profilePhone(): string {
  const value = props.thread.profile.phone;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

const lead = reactive({ ...splitName(props.thread.name), phone: profilePhone(), note: '' });
const leadErrors = reactive<Record<string, string>>({});

const PHONE_PATTERN = /^(976)?\d{8}$/;
const stripPhone = (value: string): string => value.replace(/[\s()+-]/g, '');

function validLead(): boolean {
  for (const key of Object.keys(leadErrors)) Reflect.deleteProperty(leadErrors, key);
  if (lead.lastName.trim().length < 2) leadErrors.lastName = 'Овгийг бөглөнө үү';
  if (lead.firstName.trim().length < 2) leadErrors.firstName = 'Нэрийг бөглөнө үү';
  if (!PHONE_PATTERN.test(stripPhone(lead.phone))) leadErrors.phone = 'Утасны дугаар буруу байна';
  return Object.keys(leadErrors).length === 0;
}

async function createLead(): Promise<void> {
  if (!validLead()) return;
  busy.value = true;
  error.value = null;
  try {
    const next = await api.post<FacebookThreadItem>(`/admin/facebook/threads/${props.thread.id}/lead`, {
      firstName: lead.firstName.trim(),
      lastName: lead.lastName.trim(),
      phone: stripPhone(lead.phone),
      ...(lead.note.trim() ? { note: lead.note.trim() } : {}),
    });
    emit('changed', next);
    mode.value = 'link';
  } catch (e) {
    error.value = apiErrorMessage(e, 'Сэжим үүсгэж чадсангүй');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="gks-fblink" aria-label="CRM-тэй холбох">
    <div class="gks-fblink__head">
      <div class="gks-fblink__modes" role="tablist">
        <button
          type="button"
          role="tab"
          class="gks-fblink__mode"
          :class="{ 'gks-fblink__mode--on': mode === 'link' }"
          :aria-selected="mode === 'link'"
          @click="mode = 'link'"
        >
          Бүртгэлтэй холбох
        </button>
        <button
          type="button"
          role="tab"
          class="gks-fblink__mode"
          :class="{ 'gks-fblink__mode--on': mode === 'lead' }"
          :aria-selected="mode === 'lead'"
          :disabled="Boolean(thread.lead)"
          :title="thread.lead ? 'Энэ чат сэжимтэй холбогдсон байна' : undefined"
          @click="mode = 'lead'"
        >
          Сэжим үүсгэх
        </button>
      </div>
      <button type="button" class="gks-fblink__close" aria-label="Хаах" @click="emit('close')">
        <DsIcon name="x" :size="16" />
      </button>
    </div>

    <p v-if="error" class="gks-fblink__error" role="alert">{{ error }}</p>

    <template v-if="mode === 'link'">
      <!-- What it is tied to now, with the way to undo it. -->
      <ul v-if="thread.lead || thread.client" class="gks-fblink__current" role="list">
        <li v-if="thread.lead">
          <span class="gks-fblink__kind">Сэжим</span>
          <NuxtLink :to="`/admin/consultations/${thread.lead.id}`" class="gks-fblink__name">{{ thread.lead.name }}</NuxtLink>
          <span class="gks-fblink__sub gks-tnum">{{ thread.lead.phone }}</span>
          <DsButton size="sm" variant="ghost" icon-left="unlink" :disabled="busy" @click="patchLink({ leadId: null })">
            Салгах
          </DsButton>
        </li>
        <li v-if="thread.client">
          <span class="gks-fblink__kind gks-fblink__kind--client">Үйлчлүүлэгч</span>
          <NuxtLink :to="`/admin/clients/${thread.client.id}`" class="gks-fblink__name">{{ thread.client.name }}</NuxtLink>
          <span class="gks-fblink__sub gks-tnum">{{ thread.client.code }} · {{ thread.client.phone }}</span>
          <DsButton size="sm" variant="ghost" icon-left="unlink" :disabled="busy" @click="patchLink({ clientId: null })">
            Салгах
          </DsButton>
        </li>
      </ul>

      <DsInput
        v-model="search"
        type="search"
        icon-left="search"
        placeholder="Сэжим, үйлчлүүлэгчийг нэр, утсаар хайх"
        aria-label="Холбох бүртгэл хайх"
      />

      <p v-if="searching" class="gks-fblink__hint">Хайж байна…</p>
      <p v-else-if="search.trim().length >= 2 && !candidates.length" class="gks-fblink__hint">
        Олдсонгүй. Шинэ хүн бол «Сэжим үүсгэх»-ийг сонгоно уу.
      </p>

      <ul v-if="candidates.length" class="gks-fblink__list" role="list">
        <li v-for="candidate in candidates" :key="`${candidate.kind}-${candidate.id}`" class="gks-fblink__row">
          <span class="gks-fblink__kind" :class="{ 'gks-fblink__kind--client': candidate.kind === 'CLIENT' }">
            {{ candidate.kind === 'LEAD' ? 'Сэжим' : 'Үйлчлүүлэгч' }}
          </span>
          <span class="gks-fblink__who">
            <span class="gks-fblink__name">{{ candidate.name }}</span>
            <span class="gks-fblink__sub gks-tnum">
              {{ [candidate.phone, candidateDetail(candidate)].filter(Boolean).join(' · ') }}
            </span>
          </span>
          <span v-if="isLinked(candidate)" class="gks-fblink__sub">Холбогдсон</span>
          <DsButton v-else size="sm" variant="secondary" icon-left="link" :disabled="busy" @click="link(candidate)">
            Холбох
          </DsButton>
        </li>
      </ul>
    </template>

    <form v-else class="gks-fblink__form" @submit.prevent="createLead">
      <DsInput v-model="lead.lastName" label="Овог" required :error="leadErrors.lastName" />
      <DsInput v-model="lead.firstName" label="Нэр" required :error="leadErrors.firstName" />
      <DsInput
        v-model="lead.phone"
        label="Утас"
        required
        inputmode="tel"
        :error="leadErrors.phone"
        :hint="profilePhone() ? 'AI туслахын тэмдэглэсэн дугаар' : undefined"
      />
      <DsTextarea v-model="lead.note" label="Тэмдэглэл" :rows="2" class="gks-fblink__full" />
      <p class="gks-fblink__hint gks-fblink__full">Эх сурвалж нь «{{ LEAD_SOURCE_LABELS.SOCIAL }}» болж, энэ чаттай холбогдоно.</p>
      <div class="gks-fblink__actions gks-fblink__full">
        <DsButton variant="secondary" size="sm" @click="mode = 'link'">Болих</DsButton>
        <DsButton type="submit" variant="accent" size="sm" icon-left="user-plus" :loading="busy">Сэжим үүсгэх</DsButton>
      </div>
    </form>
  </section>
</template>

<style scoped>
.gks-fblink {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-6);
  border-top: var(--border-hair) solid var(--line-soft);
  background: var(--surface-sunken);
}

.gks-fblink__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-fblink__modes { display: flex; gap: var(--sp-1); }
.gks-fblink__mode {
  padding: var(--sp-1) var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  cursor: pointer;
}
.gks-fblink__mode:disabled { cursor: not-allowed; opacity: .5; }
.gks-fblink__mode--on {
  background: var(--surface-inverse);
  border-color: var(--surface-inverse);
  color: var(--text-inverse);
  font-weight: var(--fw-semibold);
}
.gks-fblink__close {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.gks-fblink__close:hover { background: var(--surface-hover); }

.gks-fblink__error { font-size: var(--fs-micro); color: var(--danger-fg); }
.gks-fblink__hint { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-fblink__current,
.gks-fblink__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-fblink__current li,
.gks-fblink__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
}
.gks-fblink__list { max-height: 220px; overflow-y: auto; scrollbar-width: thin; }

.gks-fblink__kind {
  flex: none;
  padding: 1px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--warning-bg);
  color: var(--warning-fg);
  font-size: 11px;
  font-weight: var(--fw-semibold);
}
.gks-fblink__kind--client { background: var(--success-bg); color: var(--success-fg); }
.gks-fblink__who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.gks-fblink__name {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
a.gks-fblink__name { text-decoration: none; }
a.gks-fblink__name:hover { color: var(--brand-600); text-decoration: underline; }
.gks-fblink__current .gks-fblink__name { flex: 1; min-width: 0; }
.gks-fblink__sub { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-fblink__form { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--sp-3); }
.gks-fblink__full { grid-column: 1 / -1; }
.gks-fblink__actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }

@media (max-width: 1100px) {
  .gks-fblink { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-fblink__form { grid-template-columns: 1fr; }
}
</style>
