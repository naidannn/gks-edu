<script setup lang="ts">
import type { SavedUniversityEntry } from '@gks/shared';

/** A logged-in visitor's saved-university shortlist (1A-18). */
definePageMeta({ middleware: 'auth' });

const api = useApi();
const entries = ref<SavedUniversityEntry[]>([]);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    entries.value = await api.get<SavedUniversityEntry[]>('/me/saved-universities');
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function unsave(universityId: string) {
  entries.value = entries.value.filter((entry) => entry.university.id !== universityId);
  await api.delete(`/me/saved-universities/${universityId}`).catch(() => load());
}

useHead({ title: 'Хадгалсан сургуулиуд' });
</script>

<template>
  <div class="gks-saved">
    <header class="gks-saved__head">
      <span class="gks-eyebrow">Миний бүртгэл</span>
      <h1 class="gks-saved__title">Хадгалсан сургуулиуд</h1>
    </header>

    <div v-if="pending" class="gks-saved__grid">
      <div v-for="n in 3" :key="n" class="gks-saved__skeleton" />
    </div>

    <DsCard v-else-if="error" accent>
      <p>Хадгалсан жагсаалтыг ачаалж чадсангүй. Хуудсаа шинэчилж үзнэ үү.</p>
    </DsCard>

    <template v-else-if="entries.length">
      <ul class="gks-saved__grid">
        <li v-for="entry in entries" :key="entry.university.id" class="gks-saved__item">
          <UniversityCard :university="entry.university" />
          <DsButton
            variant="ghost"
            size="sm"
            icon-left="bookmark-x"
            class="gks-saved__remove"
            @click="unsave(entry.university.id)"
          >
            Хасах
          </DsButton>
        </li>
      </ul>
    </template>

    <DsCard v-else>
      <div class="gks-saved__empty">
        <DsIcon name="bookmark" :size="28" />
        <p>Одоогоор хадгалсан сургууль алга байна.</p>
        <DsButton variant="secondary" size="sm" @click="navigateTo('/universities')">Сургууль үзэх</DsButton>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-saved { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-saved__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}

.gks-saved__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
  list-style: none;
}
.gks-saved__skeleton { height: 260px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-saved__item { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-saved__remove { align-self: flex-start; }

.gks-saved__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6) 0;
  text-align: center;
  color: var(--text-muted);
}
</style>
