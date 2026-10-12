<script setup lang="ts">
import type { AiAdminSessionDetail, AiAdminTranscriptMessage } from '@gks/shared';

/**
 * One conversation with the assistant, as the office reads it (2E-04).
 *
 * The visitor saw words, cards and sources; this adds what produced them —
 * which tools ran with which arguments, which model answered, how long it
 * took, what it cost, and the thumb and reason the visitor left. Who it was
 * comes first, because "can somebody call this person" is the question a
 * consultant opens a conversation to answer.
 */
const props = defineProps<{ session: AiAdminSessionDetail }>();
const emit = defineEmits<{ open: [id: string]; back: [] }>();

const who = computed(() => {
  const user = props.session.user;
  if (user) return user.name || user.email || user.phone || 'Нэргүй хэрэглэгч';
  const leadName = props.session.lead
    ? `${props.session.lead.lastName} ${props.session.lead.firstName}`.trim()
    : '';
  return /\p{L}/u.test(leadName) ? leadName : 'Зочин';
});

/** What the assistant collected along the way (§6.2), minus bookkeeping flags. */
const PROFILE_LABELS: Record<string, string> = {
  name: 'Нэр',
  phone: 'Утас',
  service: 'Үйлчилгээ',
  level: 'Түвшин',
  educationLevel: 'Боловсрол',
  gpa: 'Голч',
  koreanLevel: 'Солонгос хэл',
  englishLevel: 'Англи хэл',
  intake: 'Элсэлт',
  targetIntake: 'Элсэлт',
  major: 'Мэргэжил',
  budget: 'Төсөв',
  city: 'Хот',
  age: 'Нас',
};
const profileRows = computed(() =>
  Object.entries(props.session.profile ?? {})
    .filter(([, value]) => value !== null && value !== '' && typeof value !== 'boolean')
    .map(([key, value]) => ({
      key,
      label: PROFILE_LABELS[key] ?? key,
      value: Array.isArray(value) ? value.join(', ') : String(value),
    })),
);

function usd(value: number): string {
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function messageMeta(message: AiAdminTranscriptMessage): string {
  const parts: string[] = [formatTime(message.createdAt)];
  if (message.model) parts.push(message.model);
  if (message.latencyMs) parts.push(`${(message.latencyMs / 1000).toFixed(1)}с`);
  if (message.promptTokens || message.completionTokens) {
    parts.push(`${(message.promptTokens ?? 0) + (message.completionTokens ?? 0)} токен`);
  }
  if (message.grounded === false) parts.push('эх сурвалжгүй');
  return parts.join(' · ');
}

const transcript = computed(() => props.session.messages.filter((m) => m.role === 'USER' || m.role === 'ASSISTANT'));
</script>

<template>
  <div class="ai-detail">
    <header class="ai-detail__head">
      <button type="button" class="ai-detail__back" aria-label="Жагсаалт руу буцах" @click="emit('back')">
        <DsIcon name="arrow-left" :size="18" />
      </button>
      <div class="ai-detail__who">
        <div class="ai-detail__name">
          <strong>{{ who }}</strong>
          <span v-if="session.live" class="ai-detail__live"><i /> Яг одоо</span>
          <DsBadge v-if="session.user" tone="info">Бүртгэлтэй</DsBadge>
          <DsBadge v-else tone="neutral">Зочин</DsBadge>
        </div>
        <p class="ai-detail__contacts">
          <span v-if="session.user?.email">{{ session.user.email }}</span>
          <span v-if="session.user?.phone || session.lead?.phone" class="gks-tnum">
            {{ session.user?.phone || session.lead?.phone }}
          </span>
          <span v-if="!session.user && session.anonymousId" class="gks-tnum">
            Хөтөч #{{ session.anonymousId.slice(0, 6) }}
          </span>
        </p>
      </div>
      <div class="ai-detail__links">
        <NuxtLink v-if="session.user?.client" :to="`/admin/clients/${session.user.client.id}`" class="ai-detail__link">
          <DsIcon name="user-round" :size="14" /> {{ session.user.client.code }}
        </NuxtLink>
        <NuxtLink v-if="session.lead" :to="`/admin/consultations/${session.lead.id}`" class="ai-detail__link">
          <DsIcon name="message-square" :size="14" /> Сэжим
        </NuxtLink>
        <NuxtLink v-if="session.case" :to="`/admin/cases/${session.case.id}`" class="ai-detail__link">
          <DsIcon name="folder" :size="14" /> {{ session.case.code }}
        </NuxtLink>
      </div>
    </header>

    <div class="ai-detail__body">
      <section class="ai-detail__thread" aria-label="Транскрипт">
        <template v-for="message in transcript" :key="message.id">
          <div v-if="message.role === 'USER'" class="ai-msg ai-msg--user">
            <p class="ai-msg__bubble">{{ message.content }}</p>
            <span class="ai-msg__meta gks-tnum">{{ formatTime(message.createdAt) }}</span>
          </div>
          <div v-else class="ai-msg">
            <p class="ai-msg__bubble">{{ message.content || '—' }}</p>

            <details v-if="message.toolCalls.length" class="ai-msg__tools">
              <summary>
                <DsIcon name="wrench" :size="13" />
                {{ message.toolCalls.length }} хэрэгсэл:
                {{ message.toolCalls.map((call) => call.name).join(', ') }}
              </summary>
              <ul>
                <li v-for="(call, index) in message.toolCalls" :key="index">
                  <code>{{ call.name }}</code>
                  <span v-if="call.ok === false" class="ai-msg__bad">алдаа</span>
                  <span v-if="call.durationMs" class="gks-tnum"> · {{ call.durationMs }}мс</span>
                  <pre v-if="call.arguments">{{ JSON.stringify(call.arguments, null, 2) }}</pre>
                </li>
              </ul>
            </details>

            <p v-if="message.cards.length" class="ai-msg__note">
              <DsIcon name="layout-panel-top" :size="13" />
              Карт: {{ message.cards.map((card) => card.type).join(', ') }}
            </p>
            <p v-if="message.citations.length" class="ai-msg__note">
              <DsIcon name="quote" :size="13" />
              {{ message.citations.map((source) => `${source.ref} ${source.title}`).join(' · ') }}
            </p>
            <p
              v-if="message.feedback"
              class="ai-msg__feedback"
              :class="message.feedback.value === 'DOWN' ? 'ai-msg__feedback--down' : 'ai-msg__feedback--up'"
            >
              <DsIcon :name="message.feedback.value === 'DOWN' ? 'thumbs-down' : 'thumbs-up'" :size="13" />
              <span v-if="message.feedback.reason">{{ AI_FEEDBACK_REASON_LABELS[message.feedback.reason] }}</span>
              <span v-if="message.feedback.comment">— «{{ message.feedback.comment }}»</span>
            </p>
            <span class="ai-msg__meta gks-tnum">{{ messageMeta(message) }}</span>
          </div>
        </template>
      </section>

      <aside class="ai-detail__side" aria-label="Дэлгэрэнгүй">
        <dl class="ai-facts">
          <div><dt>Код</dt><dd class="gks-tnum">{{ session.code }}</dd></div>
          <div><dt>Суваг</dt><dd>{{ AI_SESSION_CHANNEL_LABELS[session.channel] }}</dd></div>
          <div><dt>Төлөв</dt><dd>{{ AI_SESSION_STATUS_LABELS[session.status] }}</dd></div>
          <div v-if="session.outcome !== 'NONE'"><dt>Үр дүн</dt><dd>{{ AI_CHAT_OUTCOME_LABELS[session.outcome] }}</dd></div>
          <div><dt>Эхэлсэн</dt><dd class="gks-tnum">{{ formatDateTime(session.createdAt) }}</dd></div>
          <div><dt>Сүүлд</dt><dd class="gks-tnum">{{ formatDateTime(session.lastMessageAt) }}</dd></div>
          <div><dt>Асуулт</dt><dd class="gks-tnum">{{ session.questions }}</dd></div>
          <div v-if="session.landingPage"><dt>Хуудас</dt><dd class="ai-facts__wrap">{{ session.landingPage }}</dd></div>
          <div v-if="session.source"><dt>Эх сурвалж</dt><dd>{{ session.source }}</dd></div>
          <div>
            <dt>Өртөг</dt>
            <dd class="gks-tnum">{{ usd(session.costUsd) }} · {{ (session.promptTokens + session.completionTokens).toLocaleString('en-US') }} токен</dd>
          </div>
        </dl>

        <section v-if="profileRows.length" class="ai-side-block">
          <h3>AI цуглуулсан мэдээлэл</h3>
          <dl class="ai-facts">
            <div v-for="row in profileRows" :key="row.key"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
          </dl>
        </section>

        <section v-if="session.intents.length" class="ai-side-block">
          <h3>Сонирхол</h3>
          <div class="ai-tags">
            <DsTag v-for="intent in session.intents" :key="intent">{{ intent }}</DsTag>
          </div>
        </section>

        <section v-if="session.summary" class="ai-side-block">
          <h3>Хураангуй</h3>
          <p class="ai-side-block__text">{{ session.summary }}</p>
        </section>

        <section v-if="session.others.length" class="ai-side-block">
          <h3>Энэ хүний бусад яриа ({{ session.others.length }})</h3>
          <button
            v-for="other in session.others"
            :key="other.id"
            type="button"
            class="ai-other"
            @click="emit('open', other.id)"
          >
            <span class="ai-other__title">{{ other.title || 'Асуултгүй' }}</span>
            <span class="ai-other__meta gks-tnum">{{ formatRelativeMn(other.lastMessageAt) }} · {{ other.questions }} асуулт</span>
          </button>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ai-detail { display: flex; flex-direction: column; min-height: 0; height: 100%; }

.ai-detail__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.ai-detail__back {
  display: none;
  border: 0;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}
.ai-detail__who { flex: 1; min-width: 0; }
.ai-detail__name { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
.ai-detail__name strong { font-size: var(--fs-body); color: var(--text-strong); }
.ai-detail__contacts { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: 2px; font-size: var(--fs-caption); color: var(--text-muted); }
.ai-detail__live { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--success-fg); }
.ai-detail__live i { width: 8px; height: 8px; border-radius: 50%; background: var(--green-600); box-shadow: 0 0 0 3px var(--green-100); }
.ai-detail__links { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.ai-detail__link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--brand-700);
}
.ai-detail__link:hover { border-color: var(--brand-300); background: var(--brand-025); }

.ai-detail__body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 300px; }
.ai-detail__thread {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-5);
  background: var(--surface-page);
}
.ai-detail__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-4);
  border-left: var(--border-hair) solid var(--line-hairline);
}

.ai-msg { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; max-width: 78%; }
.ai-msg--user { align-self: flex-end; align-items: flex-end; }
.ai-msg__bubble {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-3);
  border-bottom-left-radius: 4px;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-strong);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.ai-msg--user .ai-msg__bubble {
  border: 0;
  border-radius: var(--radius-3);
  border-bottom-right-radius: 4px;
  background: var(--brand-600);
  color: var(--text-inverse);
}
.ai-msg__meta { font-size: 11px; color: var(--text-muted); }
.ai-msg__note { display: flex; gap: 5px; align-items: flex-start; font-size: var(--fs-caption); color: var(--text-muted); }
.ai-msg__note .gks-icon { flex: none; margin-top: 2px; }
.ai-msg__tools { width: 100%; font-size: var(--fs-caption); color: var(--text-muted); }
.ai-msg__tools summary { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; }
.ai-msg__tools ul { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-2); }
.ai-msg__tools code { font-weight: var(--fw-semibold); color: var(--text-strong); }
.ai-msg__tools pre {
  margin-top: 4px;
  padding: var(--sp-2);
  max-height: 180px;
  overflow: auto;
  border-radius: var(--radius-1);
  background: var(--surface-wash);
  font-size: 11px;
  white-space: pre-wrap;
}
.ai-msg__bad { margin-left: 4px; color: var(--danger-fg); font-weight: var(--fw-semibold); }
.ai-msg__feedback { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: var(--radius-pill); font-size: var(--fs-caption); }
.ai-msg__feedback--down { background: var(--danger-bg); color: var(--danger-fg); }
.ai-msg__feedback--up { background: var(--success-bg); color: var(--success-fg); }

.ai-facts { display: flex; flex-direction: column; gap: var(--sp-2); }
.ai-facts > div { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: var(--sp-2); font-size: var(--fs-caption); }
.ai-facts dt { color: var(--text-muted); }
.ai-facts dd { color: var(--text-strong); overflow-wrap: anywhere; }
.ai-side-block { display: flex; flex-direction: column; gap: var(--sp-2); }
.ai-side-block h3 { font-size: var(--fs-label); font-weight: var(--fw-semibold); color: var(--text-strong); }
.ai-side-block__text { font-size: var(--fs-caption); color: var(--text-body); line-height: var(--lh-body); }
.ai-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.ai-other {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ai-other:hover { border-color: var(--brand-300); }
.ai-other__title { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-other__meta { font-size: 11px; color: var(--text-muted); }

@media (max-width: 1280px) {
  .ai-detail__body { grid-template-columns: minmax(0, 1fr); overflow-y: auto; }
  .ai-detail__thread { overflow: visible; }
  .ai-detail__side { overflow: visible; border-left: 0; border-top: var(--border-hair) solid var(--line-hairline); }
}
@media (max-width: 900px) {
  .ai-detail__back { display: inline-flex; }
  .ai-detail__head { padding: var(--sp-3); flex-wrap: wrap; }
  .ai-msg { max-width: 92%; }
}
</style>
