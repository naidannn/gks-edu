<script setup lang="ts">
/** Every service cycle the client has ever had, newest first (1C-17, 1G-15). */
definePageMeta({ middleware: 'auth', layout: 'portal' });
useHead({ title: 'Миний хэрэг' });

const { overview, pending, error, load } = usePortal();

onMounted(() => load());
</script>

<template>
  <div class="gks-cases">
    <header class="gks-cases__head">
      <div>
        <span class="gks-eyebrow">Миний булан</span>
        <h1 class="gks-cases__title">Миний хэрэг</h1>
      </div>
      <DsButton variant="accent" size="sm" icon-left="plus" @click="navigateTo('/app/start')">
        Шинэ үйлчилгээ
      </DsButton>
    </header>

    <DsCard v-if="error" accent><p>{{ error }}</p></DsCard>
    <div v-else-if="pending && !overview" class="gks-cases__skeleton" />

    <DsCard v-else-if="!overview?.cases.length" padding="var(--sp-8)">
      <p class="gks-cases__empty">
        Танд одоогоор хэрэг алга байна. Үйлчилгээгээ сонгож, зуучлалын гэрээгээ өөрөө байгуулаарай.
      </p>
      <DsButton variant="accent" class="gks-cases__empty-cta" @click="navigateTo('/app/start')">
        Үйлчилгээ эхлүүлэх
      </DsButton>
    </DsCard>

    <div v-else class="gks-cases__list">
      <PortalCaseCard v-for="item in overview.cases" :key="item.id" :item="item" />
    </div>
  </div>
</template>

<style scoped>
.gks-cases { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-cases__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
.gks-cases__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-cases__skeleton { height: 160px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-cases__empty { text-align: center; color: var(--text-muted); }
.gks-cases__empty-cta { margin: var(--sp-5) auto 0; display: flex; }
.gks-cases__list { display: flex; flex-direction: column; gap: var(--sp-3); }
</style>
