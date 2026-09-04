<script setup lang="ts">
import type { UserRole } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * 1G-12 — staff register and permission levels (gksedu.md §15.6).
 *
 * A new staff member is created without a password: they set their own through
 * the claim invitation (1B-17), so an admin never handles anyone's credentials.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Ажилтны удирдлага' });

interface StaffRow {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  role: UserRole;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  _count: { assignedLeads: number; assignedCasesAsConsultant: number; assignedCasesAsDocOfficer: number };
}

const ASSIGNABLE: UserRole[] = ['ADMIN', 'CONSULTANT', 'DOC_OFFICER'];
const ROLE_OPTIONS = ASSIGNABLE.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

const api = useApi();
const rows = ref<StaffRow[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    rows.value = await api.get<StaffRow[]>('/users/staff/manage');
  } catch {
    errorMsg.value = 'Ажилтны жагсаалтыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const form = reactive({ name: '', email: '', phone: '', role: 'CONSULTANT' as UserRole });
const submitting = ref(false);

async function create() {
  errorMsg.value = null;
  notice.value = null;
  submitting.value = true;
  try {
    const created = await api.post<StaffRow>('/users/staff', {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
    });
    await api.post(`/users/${created.id}/claim-invite`).catch(() => {
      notice.value = 'Ажилтан бүртгэгдлээ, гэхдээ урилга илгээгдсэнгүй — дахин илгээнэ үү.';
    });
    notice.value ??= `${form.name} бүртгэгдэж, идэвхжүүлэх урилга илгээгдлээ.`;
    form.name = '';
    form.email = '';
    form.phone = '';
    await load();
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Бүртгэж чадсангүй';
  } finally {
    submitting.value = false;
  }
}

async function patch(row: StaffRow, changes: { role?: UserRole; isActive?: boolean }) {
  errorMsg.value = null;
  try {
    await api.patch(`/users/staff/${row.id}`, changes);
    await load();
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Хадгалж чадсангүй';
  }
}

async function resendInvite(row: StaffRow) {
  notice.value = null;
  errorMsg.value = null;
  try {
    await api.post(`/users/${row.id}/claim-invite`);
    notice.value = `${row.email} руу урилга дахин илгээгдлээ.`;
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Урилга илгээж чадсангүй';
  }
}

function workload(row: StaffRow): number {
  return row._count.assignedLeads + row._count.assignedCasesAsConsultant + row._count.assignedCasesAsDocOfficer;
}
</script>

<template>
  <div class="gks-staff">
    <header>
      <span class="gks-eyebrow">§15.6</span>
      <h1 class="gks-staff__title">Ажилтны удирдлага</h1>
      <p class="gks-staff__note">
        Шинэ ажилтан нууц үггүй бүртгэгдэж, имэйлээр ирсэн урилгаараа өөрөө нууц үгээ тохируулна.
      </p>
    </header>

    <p v-if="errorMsg" class="gks-staff__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-staff__notice">{{ notice }}</p>

    <DsCard title="Шинэ ажилтан бүртгэх">
      <form class="gks-staff__form" @submit.prevent="create">
        <DsInput v-model="form.name" label="Нэр" required />
        <DsInput v-model="form.email" label="Имэйл" type="email" required />
        <DsInput v-model="form.phone" label="Утас" />
        <DsSelect v-model="form.role" label="Эрхийн түвшин" :options="ROLE_OPTIONS" />
        <DsButton type="submit" variant="accent" :disabled="submitting">
          {{ submitting ? 'Бүртгэж байна…' : 'Бүртгэх ба урилга илгээх' }}
        </DsButton>
      </form>
    </DsCard>

    <DsCard title="Ажилтнууд">
      <p v-if="pending" class="gks-staff__note">Уншиж байна…</p>
      <p v-else-if="!rows.length" class="gks-staff__note">Ажилтан бүртгэгдээгүй байна.</p>

      <div v-else class="gks-staff__table-wrap">
        <table class="gks-staff__table">
          <thead>
            <tr>
              <th scope="col">Ажилтан</th>
              <th scope="col">Эрх</th>
              <th scope="col">Төлөв</th>
              <th scope="col" class="gks-staff__num">Ачаалал</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" :class="{ 'gks-staff__row--off': !row.isActive }">
              <td>
                <p class="gks-staff__name">{{ row.name ?? '—' }}</p>
                <p class="gks-staff__email gks-tnum">{{ row.email }}</p>
              </td>
              <td>
                <DsSelect
                  :model-value="row.role"
                  :options="ROLE_OPTIONS"
                  aria-label="Эрхийн түвшин"
                  @update:model-value="(value: string) => patch(row, { role: value as UserRole })"
                />
              </td>
              <td>
                <DsBadge :tone="row.isActive ? 'success' : 'neutral'">
                  {{ row.isActive ? 'Идэвхтэй' : 'Идэвхгүй' }}
                </DsBadge>
                <DsBadge v-if="!row.claimedAt" tone="warning">Идэвхжүүлээгүй</DsBadge>
              </td>
              <td class="gks-staff__num gks-tnum">{{ workload(row) }}</td>
              <td class="gks-staff__actions">
                <DsButton
                  v-if="!row.claimedAt"
                  variant="secondary"
                  size="sm"
                  icon-left="mail"
                  @click="resendInvite(row)"
                >
                  Урилга
                </DsButton>
                <DsButton
                  variant="secondary"
                  size="sm"
                  :icon-left="row.isActive ? 'user-x' : 'user-check'"
                  @click="patch(row, { isActive: !row.isActive })"
                >
                  {{ row.isActive ? 'Идэвхгүй болгох' : 'Сэргээх' }}
                </DsButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-staff { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-staff__title { font-size: var(--fs-h3); font-weight: var(--fw-bold); margin: var(--sp-1) 0; }
.gks-staff__note { font-size: var(--fs-small); color: var(--text-subtle); }
.gks-staff__error { color: var(--danger-600, #b00020); font-size: var(--fs-small); }
.gks-staff__notice { color: var(--success-700, #14663f); font-size: var(--fs-small); }

.gks-staff__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--sp-3);
  align-items: end;
}

.gks-staff__table-wrap { overflow-x: auto; }
.gks-staff__table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
.gks-staff__table th,
.gks-staff__table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); text-align: left; vertical-align: middle; }
.gks-staff__table th { font-size: var(--fs-micro); color: var(--text-subtle); text-transform: uppercase; letter-spacing: var(--ls-caps); }
.gks-staff__num { text-align: right; }
.gks-staff__name { font-weight: var(--fw-semibold); }
.gks-staff__email { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-staff__actions { display: flex; gap: var(--sp-2); justify-content: flex-end; }
.gks-staff__row--off { opacity: 0.6; }
</style>
