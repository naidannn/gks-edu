<script setup lang="ts">
import type { ClientDetail, ClientPortalStatus } from '@gks/shared';

/**
 * 1B-19 — can this client actually get into their own cabinet?
 *
 * Staff used to have no way of knowing. A registered client owns their address
 * on our side, which means they can neither sign up again nor log in, while the
 * process mails keep pointing at a cabinet they cannot open. The invitation now
 * goes out with the registration; this card says whether it landed, and is the
 * one place to send it again once the seven days have run out.
 */
const props = defineProps<{ client: ClientDetail }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();

const STATE: Record<ClientPortalStatus, { tone: 'neutral' | 'info' | 'success' | 'warning'; icon: string; label: string; help: string }> = {
  ACTIVE: {
    tone: 'success',
    icon: 'shield-check',
    label: 'Идэвхтэй',
    help: 'Хэрэглэгч кабинетдаа нэвтэрдэг. Нууц үгээ мартвал нэвтрэх хуудасны «Нууц үгээ мартсан уу?»-аар сэргээнэ.',
  },
  INVITED: {
    tone: 'info',
    icon: 'mail-check',
    label: 'Урилга илгээсэн',
    help: 'Урилга имэйлээр очсон. Хэрэглэгч нууц үгээ тохируулмагц энэ төлөв «Идэвхтэй» болно.',
  },
  EXPIRED: {
    tone: 'warning',
    icon: 'mail-warning',
    label: 'Урилгын хугацаа дууссан',
    help: 'Долоо хоног өнгөрсөн тул холбоос хүчингүй болсон. Хэрэглэгч холбогдвол урилгыг дахин илгээнэ үү.',
  },
  NOT_INVITED: {
    tone: 'warning',
    icon: 'mail-question',
    label: 'Урилга илгээгээгүй',
    help: 'Имэйл хаяг байгаа ч урилга илгээгдээгүй байна.',
  },
  NO_EMAIL: {
    tone: 'neutral',
    icon: 'mail-x',
    label: 'Имэйл хаяггүй',
    help: 'Имэйл хаяггүй тул кабинет нээх боломжгүй, үйл явцын мэдэгдэл ч очихгүй. Хаягийг нь засварлаж нэмнэ үү — урилга тэр дор нь илгээгдэнэ.',
  },
};

const portal = computed(() => props.client.portal);
const state = computed(() => STATE[portal.value.status]);

/** Staff read "3 хоног үлдсэн" faster than they read a date. */
const remaining = computed(() => {
  if (portal.value.status !== 'INVITED' || !portal.value.invitedUntil) return null;
  const days = Math.ceil((new Date(portal.value.invitedUntil).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? 'өнөөдөр дуусна' : `${days} хоног үлдсэн`;
});

const canSend = computed(() =>
  portal.value.status === 'INVITED' || portal.value.status === 'EXPIRED' || portal.value.status === 'NOT_INVITED',
);

const sending = ref(false);
const sent = ref(false);
const error = ref<string | null>(null);

async function resend() {
  error.value = null;
  sending.value = true;
  try {
    await api.post(`/users/${props.client.userId}/claim-invite`);
    sent.value = true;
    emit('changed');
  } catch (err) {
    error.value = apiErrorMessage(err, 'Урилга илгээхэд алдаа гарлаа.');
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <DsCard title="Хэрэглэгчийн кабинет">
    <div class="gks-portal">
      <div class="gks-portal__head">
        <DsBadge :tone="state.tone" :icon="state.icon">{{ state.label }}</DsBadge>
        <span v-if="remaining" class="gks-portal__remaining gks-tnum">{{ remaining }}</span>
        <DsBadge v-if="portal.viaGoogle" tone="neutral" icon="log-in">Google</DsBadge>
      </div>

      <p class="gks-portal__email">{{ portal.email ?? 'Имэйл хаяг бүртгэгдээгүй' }}</p>
      <p class="gks-portal__help">{{ state.help }}</p>

      <p v-if="sent" class="gks-portal__ok">
        <DsIcon name="check" :size="14" /> Урилга дахин илгээлээ — холбоос 7 хоног хүчинтэй.
      </p>
      <p v-else-if="error" class="gks-portal__error">{{ error }}</p>

      <DsButton
        v-if="canSend"
        variant="secondary"
        size="sm"
        icon-left="send"
        :loading="sending"
        @click="resend"
      >
        {{ portal.status === 'NOT_INVITED' ? 'Урилга илгээх' : 'Урилга дахин илгээх' }}
      </DsButton>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-portal { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3); }
.gks-portal__head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
.gks-portal__remaining { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-portal__email { font-size: var(--fs-body-sm); color: var(--text-strong); word-break: break-all; }
.gks-portal__help { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-portal__ok { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--success-fg); }
.gks-portal__error { font-size: var(--fs-caption); color: var(--danger-fg); }
</style>
