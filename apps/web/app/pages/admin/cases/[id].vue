<script setup lang="ts">
import type { CaseDetail } from '@gks/shared';

/**
 * A case is no longer a screen of its own (1G-17): contracts, payments and
 * stage moves live in the client's workspace. This route stays alive because
 * links to `/admin/cases/:id` are already in circulation — it resolves the
 * case to its client and hands over.
 *
 * A case whose user has no `Client` row cannot be handed over; rather than
 * bouncing silently to the list, it says so, because "this person is not in
 * the register" is the actual finding.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

/** `user.client` comes from the case detail payload (`CasesService.findOne`). */
type CaseWithClient = CaseDetail & { user: { client: { id: string; code: string } | null } };

const route = useRoute();
const api = useApi();

const orphan = ref<CaseWithClient | null>(null);
const failed = ref(false);

onMounted(async () => {
  try {
    const found = await api.get<CaseWithClient>(`/cases/${route.params.id}`);
    if (found.user?.client) {
      await navigateTo(`/admin/clients/${found.user.client.id}`, { replace: true });
      return;
    }
    orphan.value = found;
  } catch {
    failed.value = true;
  }
});

useHead({ title: 'Хэрэг · CRM' });
</script>

<template>
  <div class="gks-caseredirect">
    <DsCard v-if="failed" accent>
      <p>Хэргийг олж чадсангүй.</p>
      <NuxtLink to="/admin/cases" class="gks-caseredirect__link">Хэргийн жагсаалт руу очих →</NuxtLink>
    </DsCard>

    <DsCard v-else-if="orphan" :title="orphan.code" eyebrow="Үйлчлүүлэгчийн бүртгэлгүй хэрэг">
      <p class="gks-caseredirect__text">
        Энэ хэрэг <strong>{{ orphan.user.name ?? orphan.user.email }}</strong> хэрэглэгчийнх боловч түүнд
        үйлчлүүлэгчийн бүртгэл үүсээгүй тул ажлын талбар нээгдэхгүй байна. Тухайн хүнийг үйлчлүүлэгчээр
        бүртгэсний дараа гэрээ, төлбөр, материал нь нэг дороос харагдана.
      </p>
      <div class="gks-caseredirect__actions">
        <DsButton variant="accent" icon-left="user-plus" @click="navigateTo('/admin/clients/new')">
          Үйлчлүүлэгч бүртгэх
        </DsButton>
        <DsButton variant="secondary" @click="navigateTo('/admin/cases')">Хэргийн жагсаалт</DsButton>
      </div>
    </DsCard>

    <div v-else class="gks-skeleton__row gks-skeleton--page" />
  </div>
</template>

<style scoped>
.gks-caseredirect__text { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-caseredirect__actions { display: flex; gap: var(--sp-3); margin-top: var(--sp-4); flex-wrap: wrap; }
.gks-caseredirect__link { font-size: var(--fs-body-sm); color: var(--brand-700); }
</style>
