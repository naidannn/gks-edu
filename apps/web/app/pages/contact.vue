<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * 1A-33 — Холбоо барих.
 *
 * Four channels, in the order the office would rather receive them: the
 * consultation form (it arrives as a `Lead`, with the answers already asked),
 * chat, phone, then walking in. Every detail on the page comes from `COMPANY`,
 * so this page and the footer can never disagree about the address.
 *
 * The chat card sends a signed-in client to their own thread and everyone else
 * to the public messenger, because `/messages` starts a conversation either
 * way and there is no reason to make a client repeat who they are.
 */
const auth = useAuthStore();

const CHANNELS = [
  {
    icon: 'clipboard-list',
    title: 'Зөвлөгөө хүсэх',
    note: 'Богино анкет бөглөхөд зөвлөх тань таны нөхцөлийг урьдчилан судалж, ажлын өдөрт багтаан холбогдоно.',
    action: { label: 'Анкет бөглөх', to: '/consultation' },
  },
  {
    icon: 'message-circle',
    title: 'Онлайн чат',
    note: 'Богино асуулт байвал зөвлөхтэй шууд бичээрэй. Ажлын цагт хариу шуурхай ирнэ.',
    action: { label: 'Чат нээх', to: '/messages' },
  },
  {
    icon: 'phone',
    title: 'Утсаар',
    note: `${COMPANY.workingHours} цагт дуудлага хүлээн авна.`,
    action: { label: COMPANY.phoneLabel, href: `tel:${COMPANY.phone}` },
  },
  {
    icon: 'mail',
    title: 'И-мэйлээр',
    note: 'Албан бичиг, гэрээ, төлбөртэй холбоотой хүсэлтээ бичгээр илгээнэ үү.',
    action: { label: COMPANY.email, href: `mailto:${COMPANY.email}` },
  },
];

useHead({ title: 'Холбоо барих' });
useSeoMeta({
  description:
    `GKS EDU GROUP-тэй холбогдох: ${COMPANY.phoneLabel}, ${COMPANY.email}. Оффис: ${COMPANY.addressOneLine}. Ажлын цаг: ${COMPANY.workingHours}.`,
  ogTitle: 'Холбоо барих · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="contact">
    <header class="contact__head">
      <p class="gks-eyebrow">Холбоо барих</p>
      <h1 class="contact__title">Асуултаа асуухад хэзээ ч эрт биш.</h1>
      <p class="contact__lede">
        Сургууль сонголт, тэтгэлэг, материал, виз — юуны талаар ч асуугаарай.
        Зөвлөгөө үнэ төлбөргүй, үүрэг хүлээлгэхгүй.
      </p>
    </header>

    <ul class="contact__channels">
      <li v-for="channel in CHANNELS" :key="channel.title" class="contact__channel">
        <span class="contact__channel-icon"><DsIcon :name="channel.icon" :size="20" /></span>
        <h2 class="contact__channel-title">{{ channel.title }}</h2>
        <p class="contact__channel-note">{{ channel.note }}</p>
        <NuxtLink v-if="channel.action.to" :to="channel.action.to" class="contact__channel-link">
          {{ channel.action.label }}
          <DsIcon name="arrow-right" :size="15" />
        </NuxtLink>
        <a v-else :href="channel.action.href" class="contact__channel-link gks-tnum">
          {{ channel.action.label }}
          <DsIcon name="arrow-right" :size="15" />
        </a>
      </li>
    </ul>

    <section class="contact__office">
      <div>
        <h2 class="contact__h2">Оффис</h2>
        <address class="contact__address">
          <p class="contact__org">{{ COMPANY.legalName }}</p>
          <p class="contact__address-line">{{ COMPANY.city }}, {{ COMPANY.landmark }},</p>
          <p class="contact__address-line">{{ COMPANY.street }}</p>
        </address>
        <dl class="contact__facts">
          <div>
            <dt>Ажлын цаг</dt>
            <dd>{{ COMPANY.workingHours }}</dd>
          </div>
          <div>
            <dt>Утас</dt>
            <dd><a :href="`tel:${COMPANY.phone}`" class="gks-tnum">{{ COMPANY.phoneLabel }}</a></dd>
          </div>
          <div>
            <dt>И-мэйл</dt>
            <dd><a :href="`mailto:${COMPANY.email}`">{{ COMPANY.email }}</a></dd>
          </div>
        </dl>
        <a :href="COMPANY_MAP_URL" target="_blank" rel="noopener" class="contact__map-link">
          Газрын зураг дээр харах
          <DsIcon name="external-link" :size="15" />
        </a>
      </div>

      <DsCard title="Аль хэдийн үйлчлүүлж байгаа юу?" class="contact__client-card">
        <p class="contact__client-note">
          Гэрээтэй хэрэглэгч бол материал, төлбөр, элсэлтийн явцтай холбоотой асуултаа
          хувийн буланд зөвлөхтэйгөө бичихэд хамгийн хурдан хариу авна — таны хэргийн
          мэдээлэл зөвлөхийн нүдэн дээр байна.
        </p>
        <DsButton
          variant="accent"
          icon-right="arrow-right"
          @click="navigateTo(auth.isAuthenticated ? '/app' : '/login')"
        >
          {{ auth.isAuthenticated ? 'Хувийн булан руу' : 'Нэвтрэх' }}
        </DsButton>
      </DsCard>
    </section>
  </div>
</template>

<style scoped>
.contact { display: flex; flex-direction: column; gap: var(--sp-8); }

.contact__head { max-width: var(--container-prose); }
.contact__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.contact__lede { margin-top: var(--sp-3); color: var(--text-muted); line-height: var(--lh-body); }

.contact__channels {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-4);
  list-style: none;
}
.contact__channel {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-raised);
}
.contact__channel-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-2);
  background: var(--surface-brand-soft);
  color: var(--brand-600);
}
.contact__channel-title { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); }
.contact__channel-note { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.contact__channel-link {
  margin-top: auto;
  padding-top: var(--sp-2);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  text-decoration: none;
}
.contact__channel-link:hover { text-decoration: underline; }

.contact__office {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: var(--sp-8);
  padding-top: var(--sp-7);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.contact__h2 { font-size: var(--fs-h3); font-weight: var(--fw-semibold); }
.contact__address { margin-top: var(--sp-4); font-style: normal; }
.contact__org { font-weight: var(--fw-semibold); color: var(--text-strong); }
.contact__address-line { color: var(--text-muted); line-height: var(--lh-body); }

.contact__facts { margin-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-3); }
.contact__facts div { display: flex; gap: var(--sp-4); }
.contact__facts dt { min-width: 96px; font-size: var(--fs-caption); color: var(--text-subtle); padding-top: 2px; }
.contact__facts dd { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }

.contact__map-link {
  margin-top: var(--sp-5);
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  text-decoration: none;
}
.contact__map-link:hover { text-decoration: underline; }

.contact__client-note {
  margin-bottom: var(--sp-4);
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  line-height: var(--lh-body);
}

@media (max-width: 1024px) {
  .contact__channels { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .contact__office { grid-template-columns: 1fr; gap: var(--sp-6); }
}

@media (max-width: 560px) {
  .contact__channels { grid-template-columns: 1fr; }
}
</style>
