<script setup lang="ts">
import type { EmailCampaignItem, MarketingTemplateItem } from '@gks/shared';
import { campaignPayload, emptyCampaignForm, validateCampaign } from '~/utils/campaign-form';

/**
 * 1O — compose. Saving creates a *draft*: nothing leaves until somebody has
 * seen the preview and pressed send on the detail screen, which is the whole
 * reason the two steps are separate.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Шинэ кампанит ажил · CRM' });

const api = useApi();
const form = ref(emptyCampaignForm());
const templates = ref<MarketingTemplateItem[]>([]);
const errors = ref<Record<string, string>>({});
const errorMsg = ref<string | null>(null);
const saving = ref(false);

onMounted(async () => {
  templates.value = await api.get<MarketingTemplateItem[]>('/marketing/templates').catch(() => []);
});

async function save() {
  errors.value = validateCampaign(form.value);
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  errorMsg.value = null;
  try {
    const campaign = await api.post<EmailCampaignItem>('/marketing/campaigns', campaignPayload(form.value));
    await navigateTo(`/admin/marketing/${campaign.id}`);
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Маркетинг</span>
        <h1 class="gks-page__title">Шинэ кампанит ажил</h1>
        <p class="gks-page__hint">Хадгалсны дараа урьдчилан харж, тест илгээж байж жинхэнэ илгээлт хийнэ.</p>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-mk-new__error">{{ errorMsg }}</p>

    <MarketingCampaignFields v-model="form" :errors="errors" :templates="templates" />

    <div class="gks-mk-new__actions">
      <DsButton variant="accent" :disabled="saving" @click="save">
        {{ saving ? 'Хадгалж байна…' : 'Ноорогоор хадгалах' }}
      </DsButton>
      <DsButton variant="secondary" @click="navigateTo('/admin/marketing')">Болих</DsButton>
    </div>
  </div>
</template>

<style scoped>
.gks-mk-new__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-mk-new__actions { display: flex; gap: var(--sp-3); }
</style>
