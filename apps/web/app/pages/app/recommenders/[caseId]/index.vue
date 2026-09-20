<script setup lang="ts">
import type { QuestionnaireLevel, RecommendationItem, RecommendationListView, RecommendationStatus } from '@gks/shared';

/**
 * Recommendation letters (1D-27), from the client's side.
 *
 * The office's paper guide is five steps and one warning. Here each teacher is
 * a card that shows which of those steps their letter has reached and the one
 * thing to do now: send the link, wait, print and have it signed, or nothing.
 * The link is the default because a teacher answering in their own words is
 * what the letter is supposed to be; typing the answers in after asking is
 * offered too, because some teachers will only talk.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const config = useRuntimeConfig();
const caseId = computed(() => String(route.params.caseId));

const view = ref<RecommendationListView | null>(null);
const pending = ref(true);
const loadError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const busyId = ref<string | null>(null);
const copied = ref<string | null>(null);

const form = reactive({ name: '', relation: '', method: 'link' as 'link' | 'self', level: '' as QuestionnaireLevel | '' });
const adding = ref(false);
const showForm = ref(false);

async function load() {
  try {
    view.value = await api.get<RecommendationListView>(`/cases/${caseId.value}/recommendations`);
    showForm.value = !view.value.items.length;
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Мэдээллийг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const origin = computed(() => (import.meta.client ? window.location.origin : String(config.public.siteUrl ?? '')));
const linkFor = (item: RecommendationItem) => recommendationLink(origin.value, item.token);
const canShare = computed(() => import.meta.client && typeof navigator.share === 'function');

async function add() {
  if (!form.name.trim()) return;
  adding.value = true;
  actionError.value = null;
  try {
    const created = await api.post<RecommendationItem>(`/cases/${caseId.value}/recommendations`, {
      recommenderName: form.name.trim(),
      relation: form.relation.trim() || undefined,
      filledByApplicant: form.method === 'self',
      level: form.level || undefined,
    });
    Object.assign(form, { name: '', relation: '', method: 'link' });
    if (created.filledByApplicant) {
      await navigateTo(`/app/recommenders/${caseId.value}/${created.id}`);
      return;
    }
    await load();
    showForm.value = false;
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Нэмж чадсангүй');
  } finally {
    adding.value = false;
  }
}

async function copy(text: string, key: string) {
  try {
    await navigator.clipboard.writeText(text);
    copied.value = key;
    setTimeout(() => {
      if (copied.value === key) copied.value = null;
    }, 2500);
  } catch {
    actionError.value = 'Хуулж чадсангүй — холбоосыг гараар сонгож хуулна уу.';
  }
}

function messageFor(item: RecommendationItem) {
  return teacherMessage({
    applicantName: view.value?.applicantName ?? '',
    teacherName: item.recommenderName,
    level: item.level,
    link: linkFor(item),
  });
}

async function share(item: RecommendationItem) {
  try {
    await navigator.share({ title: 'GKS тодорхойлолт', text: messageFor(item) });
  } catch {
    // The share sheet was dismissed — nothing to report.
  }
}

async function switchMethod(item: RecommendationItem, filledByApplicant: boolean) {
  busyId.value = item.id;
  try {
    await api.patch(`/cases/${caseId.value}/recommendations/${item.id}`, { filledByApplicant });
    if (filledByApplicant) {
      await navigateTo(`/app/recommenders/${caseId.value}/${item.id}`);
      return;
    }
    await load();
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Өөрчилж чадсангүй');
  } finally {
    busyId.value = null;
  }
}

async function remove(item: RecommendationItem) {
  busyId.value = item.id;
  try {
    await api.delete(`/cases/${caseId.value}/recommendations/${item.id}`);
    await load();
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Устгаж чадсангүй');
  } finally {
    busyId.value = null;
  }
}

async function openLetter(item: RecommendationItem) {
  try {
    const signed = await api.get<{ token: string }>(`/cases/${caseId.value}/recommendations/${item.id}/letter`);
    window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
  } catch (error) {
    actionError.value = apiErrorMessage(error, 'Файлыг нээж чадсангүй');
  }
}

/** The office's five steps, reduced to the four a client can see move. */
const TRACK: { status: RecommendationStatus; label: string }[] = [
  { status: 'INVITED', label: 'Асуулга' },
  { status: 'ANSWERED', label: 'Англи хувилбар' },
  { status: 'LETTER_READY', label: 'Гарын үсэг' },
  { status: 'RECEIVED', label: 'Оффист' },
];
const ORDER: RecommendationStatus[] = TRACK.map((entry) => entry.status);
function trackState(item: RecommendationItem, index: number): 'done' | 'current' | 'todo' {
  const at = ORDER.indexOf(item.status);
  if (item.status === 'RECEIVED' || index < at) return 'done';
  return index === at ? 'current' : 'todo';
}

const STEPS = [
  { icon: 'send', title: 'Багшдаа холбоос илгээнэ', text: 'Багш монголоор 15–20 минут асуултад хариулна. Нэвтрэх шаардлагагүй.' },
  { icon: 'languages', title: 'Бид англиар бэлтгэнэ', text: 'Багшийн хариултаар GKS-ийн шаардлагад нийцсэн Recommendation Letter бичнэ.' },
  { icon: 'printer', title: 'Хэвлээд гарын үсэг зуруулна', text: 'Бэлэн болсон файлыг эндээс татаж хэвлээд, багшаар огноо бичүүлж гарын үсэг зуруулна.' },
  { icon: 'mail', title: 'Дугтуйнд хийнэ — наахгүй', text: 'Дугтуйн амсар дээгүүр багшаар гарын үсэг зуруулж, нээлттэй хэвээр нь оффист авчирна.' },
  { icon: 'shield-check', title: 'Бид шалгаад битүүмжилнэ', text: 'Агуулга, огноо, гарын үсгийг шалгасны дараа дугтуйг манай оффист битүүмжилнэ.' },
];

const needed = computed(() => view.value?.lettersNeeded ?? null);
const readyCount = computed(() => view.value?.items.filter((item) => item.status !== 'INVITED').length ?? 0);

useHead({ title: 'Багшийн тодорхойлолт' });
</script>

<template>
  <div class="gks-recs">
    <NuxtLink :to="`/app/cases/${caseId}/documents`" class="gks-recs__back">
      <DsIcon name="arrow-left" :size="16" /> Материал руу буцах
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="pending" class="gks-recs__skeleton" />

    <template v-else-if="view">
      <header class="gks-recs__head">
        <p class="gks-eyebrow">GKS тэтгэлэг<template v-if="view.level"> · {{ QUESTIONNAIRE_LEVEL_LABELS[view.level] }}</template></p>
        <h1 class="gks-recs__h1">Багшийн тодорхойлолт</h1>
        <p class="gks-recs__lead">
          <template v-if="needed">
            GKS-д <strong>{{ needed }} тодорхойлолт</strong> хэрэгтэй.
            <template v-if="view.items.length">Одоогоор {{ readyCount }}/{{ Math.max(needed, view.items.length) }} нь асуулгаа бөглөсөн.</template>
          </template>
          <template v-else>Тодорхойлолт хүсэх багшаа нэмээрэй.</template>
        </p>
      </header>

      <!-- How it goes — the office's five steps. -->
      <ol class="gks-recs__steps">
        <li v-for="(entry, index) in STEPS" :key="entry.title" class="gks-recs__step">
          <span class="gks-recs__step-num gks-tnum">{{ index + 1 }}</span>
          <DsIcon :name="entry.icon" :size="18" class="gks-recs__step-icon" />
          <p class="gks-recs__step-title">{{ entry.title }}</p>
          <p class="gks-recs__step-text">{{ entry.text }}</p>
        </li>
      </ol>

      <QuestionnaireEnvelopeNotice />

      <p v-if="actionError" class="gks-recs__error">{{ actionError }}</p>

      <!-- One card per teacher. -->
      <section v-if="view.items.length" class="gks-recs__list">
        <article v-for="item in view.items" :key="item.id" class="gks-recs__card">
          <header class="gks-recs__card-head">
            <div>
              <h2 class="gks-recs__name">{{ item.recommenderName }}</h2>
              <p v-if="item.relation" class="gks-recs__relation">{{ item.relation }}</p>
            </div>
            <DsBadge :tone="RECOMMENDATION_STATUS_TONES[item.status]">{{ RECOMMENDATION_STATUS_LABELS[item.status] }}</DsBadge>
          </header>

          <ol class="gks-recs__track" aria-label="Явц">
            <li v-for="(entry, index) in TRACK" :key="entry.status" :class="`gks-recs__track--${trackState(item, index)}`">
              <span class="gks-recs__dot" />
              <span>{{ entry.label }}</span>
            </li>
          </ol>

          <!-- Waiting on the teacher, through the link. -->
          <div v-if="item.status === 'INVITED' && !item.filledByApplicant" class="gks-recs__body">
            <p class="gks-recs__hint">
              <DsIcon :name="item.openedAt ? 'eye' : 'send'" :size="16" />
              <span v-if="item.openedAt">Багш холбоосыг {{ formatDayMonth(item.openedAt) }}-нд нээсэн. Хариултаа илгээхийг хүлээж байна.</span>
              <span v-else>Энэ холбоосыг багшдаа Messenger, и-мэйл эсвэл мессежээр илгээнэ үү.</span>
            </p>
            <div class="gks-recs__link">
              <input :value="linkFor(item)" readonly class="gks-recs__link-input" @focus="($event.target as HTMLInputElement).select()">
              <DsButton size="sm" variant="secondary" :icon-left="copied === `link:${item.id}` ? 'check' : 'copy'" @click="copy(linkFor(item), `link:${item.id}`)">
                {{ copied === `link:${item.id}` ? 'Хуулсан' : 'Холбоос' }}
              </DsButton>
            </div>
            <div class="gks-recs__actions">
              <DsButton size="sm" variant="primary" :icon-left="copied === `msg:${item.id}` ? 'check' : 'message-square-text'" @click="copy(messageFor(item), `msg:${item.id}`)">
                {{ copied === `msg:${item.id}` ? 'Мессеж хуулагдлаа' : 'Бэлэн мессеж хуулах' }}
              </DsButton>
              <DsButton v-if="canShare" size="sm" variant="secondary" icon-left="share-2" @click="share(item)">Илгээх</DsButton>
              <DsButton size="sm" variant="ghost" :loading="busyId === item.id" @click="switchMethod(item, true)">Өөрөө бөглөх</DsButton>
              <DsButton size="sm" variant="ghost" icon-left="trash-2" :disabled="busyId === item.id" @click="remove(item)">Цуцлах</DsButton>
            </div>
          </div>

          <!-- The client is typing the teacher's answers in. -->
          <div v-else-if="item.status === 'INVITED'" class="gks-recs__body">
            <p class="gks-recs__hint">
              <DsIcon name="pencil" :size="16" />
              <span>Та багшаасаа асууж бөглөж байна — {{ item.progress.answered }}/{{ item.progress.total }} асуулт.</span>
            </p>
            <div class="gks-recs__actions">
              <DsButton size="sm" variant="primary" icon-right="arrow-right" @click="navigateTo(`/app/recommenders/${caseId}/${item.id}`)">
                {{ item.progress.answered ? 'Үргэлжлүүлэх' : 'Бөглөж эхлэх' }}
              </DsButton>
              <DsButton size="sm" variant="ghost" :loading="busyId === item.id" @click="switchMethod(item, false)">Оронд нь багшид холбоос илгээх</DsButton>
              <DsButton size="sm" variant="ghost" icon-left="trash-2" :disabled="busyId === item.id" @click="remove(item)">Цуцлах</DsButton>
            </div>
          </div>

          <div v-else-if="item.status === 'ANSWERED'" class="gks-recs__body">
            <p class="gks-recs__hint">
              <DsIcon name="hourglass" :size="16" />
              <span>Хариулт {{ item.answeredAt ? formatDayMonth(item.answeredAt) : '' }}-нд ирсэн. Манай мэргэжилтэн англи хувилбарыг бэлтгэж байна — бэлэн болмогц энд харагдана.</span>
            </p>
          </div>

          <div v-else-if="item.status === 'LETTER_READY'" class="gks-recs__body">
            <p class="gks-recs__hint gks-recs__hint--act">
              <DsIcon name="printer" :size="16" />
              <span>Англи хувилбар бэлэн. Хэвлээд <strong>{{ item.recommenderName }}</strong>-аар огноо бичүүлж, гарын үсэг зуруулна уу.</span>
            </p>
            <p v-if="item.staffNote" class="gks-recs__note"><DsIcon name="message-square" :size="14" /> {{ item.staffNote }}</p>
            <div class="gks-recs__actions">
              <DsButton size="sm" variant="accent" icon-left="download" @click="openLetter(item)">
                {{ item.letterName ?? 'Тодорхойлолт татах' }}
              </DsButton>
            </div>
            <QuestionnaireEnvelopeNotice compact />
          </div>

          <div v-else class="gks-recs__body">
            <p class="gks-recs__hint gks-recs__hint--done">
              <DsIcon name="circle-check" :size="16" />
              <span>Эх хувь {{ item.receivedAt ? formatDayMonth(item.receivedAt) : '' }}-нд оффист хүлээн авсан. Энэ тодорхойлолт бэлэн боллоо.</span>
            </p>
          </div>
        </article>
      </section>

      <!-- Adding a teacher. -->
      <DsCard v-if="showForm" :title="view.items.length ? 'Өөр багш нэмэх' : 'Тодорхойлолт өгөх багшаа нэмэх'" padding="var(--sp-6)">
        <div class="gks-recs__who">
          <DsIcon name="info" :size="16" />
          <p>
            <strong>Хэнээс хүсэх вэ?</strong> Нэр хүндтэй хүнээс илүү таныг <strong>сайн мэддэг</strong>, бодит жишээ хэлж чадах хүн дээр:
            <template v-if="view.level === 'BACHELOR' || !view.level"> анги удирдсан багш, мэргэжилд тань ойр хичээлийн багш.</template>
            <template v-else> дипломын удирдагч, хичээл заасан профессор, судалгааны удирдагч.</template>
          </p>
        </div>

        <form class="gks-recs__form" @submit.prevent="add">
          <DsInput v-model="form.name" label="Багшийн нэр" required placeholder="Жишээ: Б. Сарангэрэл" />
          <DsInput v-model="form.relation" label="Таны хэн болох" placeholder="Жишээ: Математикийн багш, анги удирдсан" />

          <fieldset v-if="!view.level" class="gks-recs__field">
            <legend class="gks-recs__legend">Аль түвшинд тэтгэлэг хүсэж байна вэ?</legend>
            <div class="gks-recs__levels">
              <label v-for="level in (['BACHELOR', 'MASTER', 'PHD'] as const)" :key="level" class="gks-recs__option">
                <input v-model="form.level" type="radio" :value="level">
                <span>{{ QUESTIONNAIRE_LEVEL_LABELS[level] }}</span>
              </label>
            </div>
          </fieldset>

          <fieldset class="gks-recs__field">
            <legend class="gks-recs__legend">Асуулгыг хэн бөглөх вэ?</legend>
            <label class="gks-recs__method" :class="{ 'gks-recs__method--on': form.method === 'link' }">
              <input v-model="form.method" type="radio" value="link">
              <span>
                <span class="gks-recs__method-title"><strong>Багш өөрөө — холбоосоор</strong> <DsBadge tone="success">Санал болгох</DsBadge></span>
                <small>Багш утсан дээрээ нээгээд монголоор хариулна. Хамгийн бодит тодорхойлолт гарна.</small>
              </span>
            </label>
            <label class="gks-recs__method" :class="{ 'gks-recs__method--on': form.method === 'self' }">
              <input v-model="form.method" type="radio" value="self">
              <span>
                <strong>Би багшаасаа асуугаад өөрөө бөглөнө</strong>
                <small>Багш тань онлайнаар бөглөх боломжгүй бол асуултуудыг уншиж өгөөд хариултыг нь бичнэ.</small>
              </span>
            </label>
          </fieldset>

          <div class="gks-recs__form-actions">
            <DsButton v-if="view.items.length" variant="ghost" @click="showForm = false">Болих</DsButton>
            <DsButton
              type="submit"
              variant="accent"
              :icon-left="form.method === 'link' ? 'link' : 'pencil'"
              :loading="adding"
              :disabled="!form.name.trim() || (!view.level && !form.level)"
            >
              {{ form.method === 'link' ? 'Холбоос үүсгэх' : 'Бөглөж эхлэх' }}
            </DsButton>
          </div>
        </form>
      </DsCard>
      <DsButton v-else variant="secondary" icon-left="user-plus" class="gks-recs__add" @click="showForm = true">Багш нэмэх</DsButton>
    </template>
  </div>
</template>

<style scoped>
.gks-recs { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 960px; }
.gks-recs__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-recs__back:hover { color: var(--brand-600); }
.gks-recs__skeleton { height: 360px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-recs__head { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-recs__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-recs__lead { color: var(--text-body); }
.gks-recs__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-recs__steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--sp-3); counter-reset: none; }
.gks-recs__step {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.gks-recs__step-num { position: absolute; top: var(--sp-3); right: var(--sp-3); font-size: var(--fs-caption); font-weight: var(--fw-bold); color: var(--text-subtle); }
.gks-recs__step-icon { color: var(--brand-600); margin-bottom: var(--sp-1); }
.gks-recs__step-title { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); line-height: var(--lh-snug); }
.gks-recs__step-text { font-size: var(--fs-caption); color: var(--text-muted); line-height: var(--lh-snug); }

.gks-recs__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-recs__card { display: flex; flex-direction: column; gap: var(--sp-4); padding: var(--sp-5); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-3); background: var(--surface-card); }
.gks-recs__card-head { display: flex; justify-content: space-between; gap: var(--sp-3); align-items: flex-start; }
.gks-recs__name { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-recs__relation { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-recs__track { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-recs__track li { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--sp-1); text-align: center; }
.gks-recs__track li::before { content: ''; position: absolute; top: 6px; left: -50%; width: 100%; height: 2px; background: var(--n-200); z-index: 0; }
.gks-recs__track li:first-child::before { display: none; }
.gks-recs__dot { position: relative; z-index: 1; width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--n-300); background: var(--n-000); }
.gks-recs__track--done { color: var(--success-fg); }
.gks-recs__track--done .gks-recs__dot { border-color: var(--success-fg); background: var(--success-fg); }
.gks-recs__track--done::before { background: var(--success-fg) !important; }
.gks-recs__track--current { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-recs__track--current .gks-recs__dot { border-color: var(--brand-600); box-shadow: 0 0 0 4px var(--brand-050); }

.gks-recs__body { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-recs__hint { display: flex; gap: var(--sp-2); align-items: flex-start; font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-recs__hint > :first-child { flex-shrink: 0; margin-top: 2px; color: var(--brand-600); }
.gks-recs__hint--act > :first-child { color: var(--amber-600); }
.gks-recs__hint--done > :first-child { color: var(--success-fg); }
.gks-recs__note { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--fs-body-sm); color: var(--text-muted); font-style: italic; }
.gks-recs__link { display: flex; gap: var(--sp-2); }
.gks-recs__link-input {
  flex: 1;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
  font-family: var(--font-mono);
  font-size: var(--fs-caption);
  color: var(--text-body);
}
.gks-recs__actions { display: flex; gap: var(--sp-2); flex-wrap: wrap; }

.gks-recs__who { display: flex; gap: var(--sp-3); align-items: flex-start; margin-bottom: var(--sp-5); padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-2); background: var(--info-bg); color: var(--info-fg); font-size: var(--fs-body-sm); }
.gks-recs__who > :first-child { flex-shrink: 0; margin-top: 2px; }
.gks-recs__form { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-recs__field { display: flex; flex-direction: column; gap: var(--sp-2); border: 0; padding: 0; margin: 0; }
.gks-recs__legend { font-size: var(--fs-label); font-weight: var(--fw-semibold); color: var(--text-body); margin-bottom: var(--sp-2); }
.gks-recs__levels { display: flex; gap: var(--sp-4); flex-wrap: wrap; }
.gks-recs__option { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--fs-body-sm); cursor: pointer; }
.gks-recs__method {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-recs__method input,
.gks-recs__option input { accent-color: var(--brand-600); }
.gks-recs__method input { margin-top: 4px; }
.gks-recs__method span { display: flex; flex-direction: column; gap: var(--sp-1); font-size: var(--fs-body-sm); }
.gks-recs__method .gks-recs__method-title { flex-direction: row; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.gks-recs__method small { color: var(--text-muted); font-size: var(--fs-caption); }
.gks-recs__method--on { border-color: var(--brand-600); background: var(--brand-025); }
.gks-recs__form-actions { display: flex; justify-content: flex-end; gap: var(--sp-3); }
.gks-recs__add { align-self: flex-start; }

@media (max-width: 900px) {
  .gks-recs__steps { grid-template-columns: minmax(0, 1fr); gap: 0; border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-3); background: var(--surface-card); }
  .gks-recs__step { display: grid; grid-template-columns: 28px 1fr; column-gap: var(--sp-3); border: 0; border-radius: 0; background: none; padding: var(--sp-3) var(--sp-4); }
  .gks-recs__step + .gks-recs__step { border-top: var(--border-hair) solid var(--line-hairline); }
  .gks-recs__step-num { display: none; }
  .gks-recs__step-icon { grid-row: 1 / span 2; margin: 2px 0 0; }
}
</style>
