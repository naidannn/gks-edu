<script setup lang="ts">
import type { AiAssistantConfigPayload } from '@gks/shared';

/**
 * The assistant's settings (2E-05; the API is 2B-02).
 *
 * This screen is the only way `enabled` can be turned on, which makes it the
 * gate on the whole of phase 2: the widget draws nothing until it is true, and
 * the public endpoint refuses to start a conversation while it is false. So the
 * switch is first, with what it actually does written beside it — a kill switch
 * nobody is sure about gets left alone in exactly the moment it is needed.
 *
 * Everything below it is a business decision rather than a constant, the same
 * arrangement as `ServicePricing` and the ranking weights (CLAUDE.md): model,
 * thresholds, budgets, wording. The bounds are enforced by the API; the hints
 * here explain what a value costs, because a number with no consequence
 * attached is one somebody rounds.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'AI туслахын тохиргоо · Админ' });

const api = useApi();

const config = ref<AiAssistantConfigPayload | null>(null);
const loading = ref(true);
const saving = ref(false);
const errorMsg = ref<string | null>(null);
const savedAt = ref<number | null>(null);

const enabled = ref(false);
const copilotEnabled = ref(true);
const chatModel = ref('');
const fallbackModel = ref('');
const embeddingModel = ref('');
const temperature = ref('0.3');
const maxOutputTokens = ref('1200');
const retrievalTopK = ref('6');
const minSimilarity = ref('0.66');
const sessionMessageLimit = ref('40');
const sessionTokenBudget = ref('60000');
const dailyTokenBudget = ref('1000000');
const leadCaptureAfterMessages = ref('3');
const greeting = ref('');
const persona = ref('');

function fill(value: AiAssistantConfigPayload) {
  enabled.value = value.enabled;
  copilotEnabled.value = value.copilotEnabled;
  chatModel.value = value.chatModel;
  fallbackModel.value = value.fallbackModel ?? '';
  embeddingModel.value = value.embeddingModel;
  temperature.value = String(value.temperature);
  maxOutputTokens.value = String(value.maxOutputTokens);
  retrievalTopK.value = String(value.retrievalTopK);
  minSimilarity.value = String(value.minSimilarity);
  sessionMessageLimit.value = String(value.sessionMessageLimit);
  sessionTokenBudget.value = String(value.sessionTokenBudget);
  dailyTokenBudget.value = String(value.dailyTokenBudget);
  leadCaptureAfterMessages.value = String(value.leadCaptureAfterMessages);
  greeting.value = value.greeting;
  persona.value = value.persona;
}

async function load() {
  loading.value = true;
  try {
    const result = await api.get<AiAssistantConfigPayload>('/admin/ai/config');
    config.value = result;
    fill(result);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Тохиргоог ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

/** Which provider a model name routes to — `AiConfigService.providerFor`. */
function providerOf(model: string): string {
  return model.trim().startsWith('deepseek-') ? 'DeepSeek' : 'Gemini';
}

/**
 * The daily ceiling in money, at the rough blended rate the plan budgets on
 * (§15-31). A token count means nothing to the person who signs for it.
 */
const dailyCost = computed(() => {
  const tokens = Number.parseInt(dailyTokenBudget.value, 10);
  if (!Number.isInteger(tokens)) return null;
  return {
    perDay: (tokens / 1_000_000) * 0.4,
    perMonth: ((tokens / 1_000_000) * 0.4) * 30,
  };
});

async function save() {
  saving.value = true;
  errorMsg.value = null;
  try {
    const result = await api.patch<AiAssistantConfigPayload>('/admin/ai/config', {
      enabled: enabled.value,
      copilotEnabled: copilotEnabled.value,
      chatModel: chatModel.value.trim(),
      // An empty box means "no fallback", which the column stores as null; the
      // API rejects an empty string, so it is dropped rather than sent.
      ...(fallbackModel.value.trim() ? { fallbackModel: fallbackModel.value.trim() } : {}),
      embeddingModel: embeddingModel.value.trim(),
      temperature: Number.parseFloat(temperature.value),
      maxOutputTokens: Number.parseInt(maxOutputTokens.value, 10),
      retrievalTopK: Number.parseInt(retrievalTopK.value, 10),
      minSimilarity: Number.parseFloat(minSimilarity.value),
      sessionMessageLimit: Number.parseInt(sessionMessageLimit.value, 10),
      sessionTokenBudget: Number.parseInt(sessionTokenBudget.value, 10),
      dailyTokenBudget: Number.parseInt(dailyTokenBudget.value, 10),
      leadCaptureAfterMessages: Number.parseInt(leadCaptureAfterMessages.value, 10),
      greeting: greeting.value.trim(),
      persona: persona.value.trim(),
    });
    config.value = result;
    fill(result);
    savedAt.value = Date.now();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="gks-page gks-ai-config">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">AI туслах</span>
        <h1 class="gks-page__title">Туслахын тохиргоо</h1>
        <p class="gks-page__hint">
          Загвар, босго, төсөв, ярианы өнгө — бүгд деплой хийхгүйгээр өөрчлөгдөх бодлогын утгууд.
        </p>
      </div>
    </header>

    <DsCard v-if="loading">Ачаалж байна…</DsCard>

    <template v-else>
      <DsCard :accent="!enabled" title="Асаах / унтраах">
        <DsSwitch v-model="enabled" label="AI туслах хэрэглэгчдэд харагдана" />
        <p class="gks-ai-config__note">
          Унтраалттай үед виджет <strong>огт харагдахгүй</strong>, шинэ яриа ч эхлэхгүй.
          Асаахаас өмнө мэдлэгийн санд нийтлэгдсэн баримт байгаа эсэхийг шалгана уу —
          санд юу ч байхгүй бол туслах "мэдэхгүй" гэж хариулах болно.
        </p>
        <DsSwitch v-model="copilotEnabled" label="Ажилтны Copilot идэвхтэй" />
        <p class="gks-ai-config__note">
          Энэ нь дотоод хэрэглээ — сэжим, хэргийн дэлгэц дээрх туслах. Үйлчлүүлэгчийн чаттай
          холбоогүй тул тусдаа асаана.
        </p>
      </DsCard>

      <DsCard title="Загвар">
        <div class="gks-form-grid">
          <DsInput
            v-model="chatModel"
            label="Үндсэн загвар"
            placeholder="gemini-3.1-flash"
            :hint="`→ ${providerOf(chatModel)} рүү очно. deepseek- гэж эхэлбэл DeepSeek, бусад нь Gemini.`"
          />
          <DsInput
            v-model="fallbackModel"
            label="Нөөц загвар (заавал биш)"
            placeholder="deepseek-v4-flash"
            hint="Үндсэн загвар 429 эсвэл 5xx өгвөл нэг удаа энэ рүү шилжинэ. Хоосон бол шилжихгүй."
          />
        </div>
        <DsInput
          v-model="embeddingModel"
          label="Embedding загвар"
          placeholder="gemini-embedding-001"
          hint="Үүнийг солиход мэдлэгийн сангийн бүх хэсэг дахин индексжинэ — өдрийн ажил, дураараа солихгүй."
        />
        <div class="gks-form-grid">
          <DsInput
            v-model="temperature"
            label="Temperature"
            type="number"
            min="0"
            max="1"
            step="0.05"
            hint="0 = үргэлж ижил хариулт, 1 = чөлөөтэй. Үнэ, хугацаа ярьдаг туслахад 0.2–0.4 тохиромжтой."
          />
          <DsInput
            v-model="maxOutputTokens"
            label="Хариултын дээд урт (token)"
            type="number"
            min="100"
            max="4000"
            hint="Монгол хэлэнд ойролцоогоор 2.25 тэмдэгт = 1 token."
          />
        </div>
      </DsCard>

      <DsCard title="Мэдлэгийн сангаас хайх">
        <div class="gks-form-grid">
          <DsInput
            v-model="retrievalTopK"
            label="Нэг ярианд өгөх хэсгийн тоо"
            type="number"
            min="1"
            max="20"
            hint="Олон өгвөл загвар төөрөх, цөөн өгвөл хариулт дутуу гарна."
          />
          <DsInput
            v-model="minSimilarity"
            label="Ижил төстэй байдлын босго"
            type="number"
            min="0.3"
            max="0.95"
            step="0.01"
            hint="Энэ корпус дээр хэмжсэн: хамааралгүй баримт ~0.62, жинхэнэ таарц ~0.75. 0.6-аас доош бол шуугиан, 0.8-аас дээш бол чимээгүй."
          />
        </div>
      </DsCard>

      <DsCard title="Төсөв ба хязгаар">
        <div class="gks-form-grid">
          <DsInput
            v-model="sessionMessageLimit"
            label="Нэг ярианы мессежийн дээд тоо"
            type="number"
            min="4"
            max="200"
            hint="Хэтэрвэл туслах зөвлөх рүү шилжүүлнэ."
          />
          <DsInput
            v-model="sessionTokenBudget"
            label="Нэг ярианы token төсөв"
            type="number"
            min="5000"
          />
        </div>
        <DsInput
          v-model="dailyTokenBudget"
          label="Өдрийн нийт token төсөв"
          type="number"
          min="50000"
          hint="Дүүрэхэд туслах маргааш хүртэл чимээгүй болно — алдаа биш, тааз. 80%-д Slack сэрэмжлүүлэг очно."
        />
        <p v-if="dailyCost" class="gks-ai-config__example">
          Ойролцоогоор <strong class="gks-tnum">${{ dailyCost.perDay.toFixed(2) }}</strong>/өдөр,
          <strong class="gks-tnum">${{ dailyCost.perMonth.toFixed(0) }}</strong>/сар
          (1M token ≈ $0.40 гэсэн холимог үнээр — жинхэнэ өртөг загвараас хамаарна).
        </p>
        <DsInput
          v-model="leadCaptureAfterMessages"
          label="Хэдэн мессежийн дараа холбоо барих мэдээлэл асуух"
          type="number"
          min="1"
          max="20"
          hint="Эхний мессежээс асуувал зочин гарч одно. Утсыг үнэ цэнэ өгсний дараа асуудаг."
        />
      </DsCard>

      <DsCard title="Ярианы өнгө">
        <DsTextarea
          v-model="greeting"
          label="Мэндчилгээ"
          :rows="2"
          hint="Виджет нээхэд харагдах эхний мөр."
        />
        <DsTextarea
          v-model="persona"
          label="Персона"
          :rows="8"
          hint="Туслах хэн болох, ямар өнгөөр ярих. Энэ нь системийн заавар бүрт ордог тул өөрчлөхөд бүх хариулт өөрчлөгдөнө."
        />
      </DsCard>

      <p v-if="errorMsg" class="gks-ai-config__error">{{ errorMsg }}</p>

      <footer class="gks-form-actions">
        <p v-if="config" class="gks-ai-config__hint">
          Сүүлд шинэчилсэн: {{ formatDateTime(config.updatedAt) }}
          <span v-if="config.updatedBy?.name"> · {{ config.updatedBy.name }}</span>
        </p>
        <span v-if="savedAt" class="gks-ai-config__saved">Хадгаллаа</span>
        <DsButton variant="accent" icon-left="check" :loading="saving" @click="save">Хадгалах</DsButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.gks-ai-config { max-width: 820px; }
.gks-ai-config :deep(.gks-card) + :deep(.gks-card) { margin-top: var(--sp-5); }
.gks-ai-config :deep(.gks-card) > * + * { margin-top: var(--sp-4); }

.gks-ai-config__note {
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-muted);
}
.gks-ai-config__example {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--surface-wash);
  font-size: var(--fs-body-sm);
  color: var(--text-strong);
}
.gks-ai-config__hint { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-ai-config__saved { font-size: var(--fs-caption); color: var(--success-600, var(--brand-600)); font-weight: var(--fw-semibold); }
.gks-ai-config__error {
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--danger-050, var(--surface-wash));
  color: var(--danger-700, var(--text-strong));
  font-size: var(--fs-body-sm);
}
</style>
