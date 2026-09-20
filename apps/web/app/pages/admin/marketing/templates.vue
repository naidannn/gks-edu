<script setup lang="ts">
import type { MarketingTemplateItem } from '@gks/shared';
import { EMAIL_TONE_LABELS, MARKETING_PLACEHOLDERS } from '~/utils/marketing';

/**
 * 1O — the reusable campaign bodies.
 *
 * A campaign *copies* the template it was built from, so editing here never
 * rewrites a mail already sent; what it changes is the next campaign that
 * starts from it. The four shipped templates carry a `key` and are topped up
 * on every deploy — the wording in them is the office's, not the code's, so
 * the top-up only ever adds what is missing.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Имэйлийн загвар · CRM' });

const TONE_OPTIONS = selectOptions(EMAIL_TONE_LABELS);

const api = useApi();
const templates = ref<MarketingTemplateItem[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);
const saving = ref(false);

const form = reactive({
  id: '',
  name: '',
  subject: '',
  eyebrow: '',
  heading: '',
  bodyMn: '',
  ctaLabel: '',
  ctaUrl: '',
  footerNote: '',
  tone: 'info',
  isActive: true,
});

async function load() {
  pending.value = true;
  try {
    templates.value = await api.get<MarketingTemplateItem[]>('/marketing/templates');
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Загваруудыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);

function reset() {
  Object.assign(form, {
    id: '', name: '', subject: '', eyebrow: '', heading: '', bodyMn: '',
    ctaLabel: '', ctaUrl: '', footerNote: '', tone: 'info', isActive: true,
  });
}

function edit(template: MarketingTemplateItem) {
  Object.assign(form, {
    id: template.id,
    name: template.name,
    subject: template.subject,
    eyebrow: template.eyebrow ?? '',
    heading: template.heading ?? '',
    bodyMn: template.bodyMn,
    ctaLabel: template.ctaLabel ?? '',
    ctaUrl: template.ctaUrl ?? '',
    footerNote: template.footerNote ?? '',
    tone: template.tone,
    isActive: template.isActive,
  });
}

async function save() {
  errorMsg.value = null;
  saving.value = true;
  const body = {
    name: form.name.trim(),
    subject: form.subject.trim(),
    eyebrow: form.eyebrow.trim() || undefined,
    heading: form.heading.trim() || undefined,
    bodyMn: form.bodyMn,
    ctaLabel: form.ctaLabel.trim() || undefined,
    ctaUrl: form.ctaUrl.trim() || undefined,
    footerNote: form.footerNote.trim() || undefined,
    tone: form.tone,
    isActive: form.isActive,
  };
  try {
    if (form.id) await api.patch(`/marketing/templates/${form.id}`, body);
    else await api.post('/marketing/templates', body);
    notice.value = 'Загвар хадгалагдлаа.';
    reset();
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

async function remove(template: MarketingTemplateItem) {
  try {
    await api.delete(`/marketing/templates/${template.id}`);
    if (form.id === template.id) reset();
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Устгаж чадсангүй');
  }
}

async function seedMissing() {
  try {
    const result = await api.post<{ created: number; existing: number }>('/marketing/templates/seed');
    notice.value = `${result.created} шинэ загвар нэмэгдлээ (${result.existing} хэвээр).`;
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Загвар нөхөж чадсангүй');
  }
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Маркетинг</span>
        <h1 class="gks-page__title">Имэйлийн загвар</h1>
        <p class="gks-page__hint">
          Загвараас кампанит ажил үүсгэхэд агуулга нь хуулагдана — сүүлд засварласан нь
          илгээчихсэн захидалд нөлөөлөхгүй.
        </p>
      </div>
      <div class="gks-mk-t__head-actions">
        <DsButton variant="secondary" size="sm" icon-left="plus" @click="seedMissing">Дутууг нөхөх</DsButton>
        <DsButton variant="secondary" size="sm" @click="navigateTo('/admin/marketing')">Кампанит ажил</DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-mk-t__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-mk-t__notice">{{ notice }}</p>

    <DsCard :title="form.id ? 'Загвар засах' : 'Шинэ загвар'">
      <form class="gks-form-grid" @submit.prevent="save">
        <DsInput v-model="form.name" label="Нэр" class="gks-form-grid__full" required />
        <DsInput v-model="form.subject" label="Гарчиг (subject)" class="gks-form-grid__full" required />
        <DsInput v-model="form.eyebrow" label="Ангилал" />
        <DsSelect v-model="form.tone" label="Өнгө аяс" :options="TONE_OPTIONS" />
        <DsInput v-model="form.heading" label="Том гарчиг" class="gks-form-grid__full" />
        <DsTextarea v-model="form.bodyMn" label="Агуулга" :rows="12" class="gks-form-grid__full" />
        <p class="gks-mk-t__hint gks-form-grid__full">
          <code v-for="item in MARKETING_PLACEHOLDERS" :key="item.name">{{ item.name }}</code>
          орлуулга илгээх үед бөглөгдөнө.
        </p>
        <DsInput v-model="form.ctaLabel" label="Товчны бичиг" />
        <DsInput v-model="form.ctaUrl" label="Товчны холбоос" placeholder="https://gksedu.mn/…" />
        <DsInput v-model="form.footerNote" label="Хөлийн тэмдэглэл" class="gks-form-grid__full" />

        <div class="gks-mk-t__actions">
          <DsSwitch v-model="form.isActive" label="Идэвхтэй" />
          <DsButton type="submit" variant="accent" :disabled="saving">
            {{ saving ? 'Хадгалж байна…' : 'Хадгалах' }}
          </DsButton>
          <DsButton v-if="form.id" variant="secondary" @click="reset">Болих</DsButton>
        </div>
      </form>
    </DsCard>

    <DsCard title="Загварууд">
      <p v-if="pending" class="gks-page__hint">Уншиж байна…</p>
      <p v-else-if="!templates.length" class="gks-empty">Загвар алга.</p>
      <ul v-else class="gks-mk-t__list">
        <li v-for="template in templates" :key="template.id" class="gks-mk-t__item">
          <div class="gks-mk-t__item-main">
            <p class="gks-mk-t__item-title">{{ template.name }}</p>
            <p class="gks-mk-t__item-meta">{{ template.subject }}</p>
          </div>
          <DsBadge :tone="template.isActive ? 'success' : 'neutral'">
            {{ template.isActive ? 'Идэвхтэй' : 'Идэвхгүй' }}
          </DsBadge>
          <div class="gks-mk-t__item-actions">
            <DsButton variant="secondary" size="sm" icon-left="pencil" @click="edit(template)">Засах</DsButton>
            <DsButton variant="secondary" size="sm" icon-left="trash-2" @click="remove(template)">Устгах</DsButton>
          </div>
        </li>
      </ul>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-mk-t__head-actions { display: flex; gap: var(--sp-2); }
.gks-mk-t__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-mk-t__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-mk-t__actions { grid-column: 1 / -1; display: flex; gap: var(--sp-3); align-items: center; }
.gks-mk-t__hint { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-mk-t__hint code {
  padding: 1px 5px;
  margin-right: 4px;
  border-radius: var(--radius-1);
  background: var(--surface-sunken);
}
.gks-mk-t__list { list-style: none; margin: 0; padding: 0; }
.gks-mk-t__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-mk-t__item:last-child { border-bottom: none; }
.gks-mk-t__item-main { flex: 1; min-width: 0; }
.gks-mk-t__item-title { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.gks-mk-t__item-meta { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-mk-t__item-actions { display: flex; gap: var(--sp-2); }
</style>
