<script setup lang="ts">
import type { UserRole } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * 1G-12 — the register of everyone who can sign into the CRM (gksedu.md §15.6).
 *
 * Two things shape this screen:
 *
 * - There are two ways to hand someone a login, and the admin picks per
 *   person: type a password here and the account works immediately, or leave
 *   the field empty and the claim invitation (1B-17) lets them set their own.
 *   A password can be re-keyed from the row later — which signs that person
 *   out everywhere, on purpose.
 * - Deactivating, not deleting, is how someone leaves. Most of the actor
 *   columns in the schema are `onDelete: SetNull`, so erasing an account that
 *   has worked would quietly strip their name off the contracts, reviews and
 *   audit rows they are on. The API therefore only allows a hard delete while
 *   the row has left no trace — a mistyped invitation — and says so via
 *   `deletable`.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });
useHead({ title: 'Системийн хэрэглэгч' });

interface StaffRow {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  claimedAt: string | null;
  createdAt: string;
  /** Has a way in — claimed the invitation, or signed in with Google. */
  hasLogin: boolean;
  /** Leads and cases they are carrying right now. */
  workload: number;
  /** False once the account appears anywhere in the record; deactivate instead. */
  deletable: boolean;
}

const ASSIGNABLE: UserRole[] = ['ADMIN', 'CONSULTANT', 'DOC_OFFICER'];
const ROLE_OPTIONS = ASSIGNABLE.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
const ROLE_FILTER_OPTIONS = [{ value: '', label: 'Бүх эрх' }, ...ROLE_OPTIONS];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Бүх төлөв' },
  { value: 'active', label: 'Идэвхтэй' },
  { value: 'inactive', label: 'Идэвхгүй' },
  { value: 'pending', label: 'Урилга хүлээж буй' },
];

const api = useApi();
const auth = useAuthStore();

const rows = ref<StaffRow[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    rows.value = await api.get<StaffRow[]>('/users/staff/manage');
  } catch {
    errorMsg.value = 'Хэрэглэгчийн жагсаалтыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

/* ── Filters ────────────────────────────────────────────────────────────── */

const search = ref('');
const roleFilter = ref('');
const statusFilter = ref('');

const visible = computed(() => {
  const term = search.value.trim().toLowerCase();
  return rows.value.filter((row) => {
    if (roleFilter.value && row.role !== roleFilter.value) return false;
    if (statusFilter.value === 'active' && !row.isActive) return false;
    if (statusFilter.value === 'inactive' && row.isActive) return false;
    if (statusFilter.value === 'pending' && row.hasLogin) return false;
    if (!term) return true;
    return [row.name, row.email, row.phone].some((field) => field?.toLowerCase().includes(term));
  });
});

const stats = computed(() => ({
  total: rows.value.length,
  active: rows.value.filter((row) => row.isActive).length,
  admins: rows.value.filter((row) => row.isActive && row.role === 'ADMIN').length,
  pending: rows.value.filter((row) => !row.hasLogin).length,
}));

/* ── One form for both "нэмэх" and "засах" ──────────────────────────────── */

const blank = () => ({ name: '', email: '', phone: '', role: 'CONSULTANT' as UserRole, password: '' });

/**
 * A password the admin can read out over the phone: no look-alike characters,
 * and drawn from the CSPRNG rather than `Math.random`.
 */
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789';
function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}
const form = reactive(blank());
const editingId = ref<string | null>(null);
const formOpen = ref(false);
const submitting = ref(false);

function startCreate() {
  Object.assign(form, blank());
  editingId.value = null;
  formOpen.value = true;
  errorMsg.value = null;
}

function startEdit(row: StaffRow) {
  form.password = '';
  form.name = row.name ?? '';
  form.email = row.email ?? '';
  form.phone = row.phone ?? '';
  form.role = row.role;
  editingId.value = row.id;
  formOpen.value = true;
  errorMsg.value = null;
}

function closeForm() {
  formOpen.value = false;
  editingId.value = null;
}

/** Guards the one change an admin can never undo from this screen. */
const isSelf = (row: StaffRow) => row.id === auth.user?.id;
const editingSelf = computed(() => Boolean(editingId.value && editingId.value === auth.user?.id));

async function submit() {
  errorMsg.value = null;
  notice.value = null;
  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      role: form.role,
    };

    if (editingId.value) {
      await api.patch(`/users/staff/${editingId.value}`, { ...payload, phone: form.phone.trim() });
      notice.value = `${payload.name}-ийн мэдээлэл шинэчлэгдлээ.`;
    } else if (form.password) {
      await api.post<StaffRow>('/users/staff', { ...payload, password: form.password });
      notice.value = `${payload.name} бүртгэгдлээ. Нууц үгийг нь өөрт нь дамжуулна уу — тэр дороо нэвтэрч чадна.`;
    } else {
      const created = await api.post<StaffRow>('/users/staff', payload);
      const invited = await sendInvite(created.id);
      notice.value = invited
        ? `${payload.name} бүртгэгдэж, идэвхжүүлэх урилга илгээгдлээ.`
        : `${payload.name} бүртгэгдлээ, гэхдээ урилга илгээгдсэнгүй — жагсаалтаас дахин илгээнэ үү.`;
    }

    closeForm();
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хадгалж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

/* ── Row actions ────────────────────────────────────────────────────────── */

const busyId = ref<string | null>(null);
const confirmingId = ref<string | null>(null);

async function patch(row: StaffRow, changes: { role?: UserRole; isActive?: boolean }) {
  errorMsg.value = null;
  notice.value = null;
  busyId.value = row.id;
  try {
    await api.patch(`/users/staff/${row.id}`, changes);
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хадгалж чадсангүй');
  } finally {
    busyId.value = null;
  }
}

async function sendInvite(id: string): Promise<boolean> {
  try {
    await api.post(`/users/${id}/claim-invite`);
    return true;
  } catch {
    return false;
  }
}

/* ── Нууц үг тохоох ─────────────────────────────────────────────────────── */

const passwordId = ref<string | null>(null);
const passwordValue = ref('');

function startPassword(row: StaffRow) {
  passwordId.value = row.id;
  passwordValue.value = generatePassword();
  confirmingId.value = null;
  errorMsg.value = null;
  notice.value = null;
}

async function savePassword(row: StaffRow) {
  if (passwordValue.value.length < 8) {
    errorMsg.value = 'Нууц үг дор хаяж 8 тэмдэгт байна.';
    return;
  }

  errorMsg.value = null;
  busyId.value = row.id;
  try {
    await api.patch(`/users/staff/${row.id}/password`, { password: passwordValue.value });
    notice.value = `${row.name ?? row.email}-ийн нууц үг солигдлоо. Тэдний нээлттэй байсан бүх сесс хаагдсан.`;
    passwordId.value = null;
    passwordValue.value = '';
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Нууц үг солиж чадсангүй');
  } finally {
    busyId.value = null;
  }
}

async function resendInvite(row: StaffRow) {
  notice.value = null;
  errorMsg.value = null;
  busyId.value = row.id;
  const sent = await sendInvite(row.id);
  busyId.value = null;
  if (sent) notice.value = `${row.email} руу урилга дахин илгээгдлээ.`;
  else errorMsg.value = 'Урилга илгээж чадсангүй';
}

async function remove(row: StaffRow) {
  errorMsg.value = null;
  notice.value = null;
  busyId.value = row.id;
  try {
    await api.delete(`/users/staff/${row.id}`);
    notice.value = `${row.name ?? row.email} устгагдлаа.`;
    confirmingId.value = null;
    if (editingId.value === row.id) closeForm();
    await load();
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Устгаж чадсангүй');
  } finally {
    busyId.value = null;
  }
}

function deleteHint(row: StaffRow): string {
  if (isSelf(row)) return 'Өөрийн бүртгэлээ устгах боломжгүй';
  return 'Ажлын түүхтэй тул устгах боломжгүй — идэвхгүй болгоно уу';
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">§15.6</span>
        <h1 class="gks-page__title">Системийн хэрэглэгч</h1>
        <p class="gks-page__hint">
          CRM-д нэвтэрч ажиллах эрхтэй хүмүүс. Шинэ хэрэглэгчид нууц үгийг нь энд шууд тохоож
          өгөх, эсвэл хоосон орхиж имэйлийн урилгаар өөрөө тохируулуулж болно.
        </p>
      </div>
      <div class="gks-page__actions">
        <DsButton variant="accent" icon-left="user-plus" @click="startCreate">Хэрэглэгч нэмэх</DsButton>
      </div>
    </header>

    <p v-if="errorMsg" class="gks-staff__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-staff__notice">{{ notice }}</p>

    <div class="gks-stats">
      <div class="gks-stat">
        <span>Нийт хэрэглэгч</span>
        <strong>{{ stats.total }}</strong>
      </div>
      <div class="gks-stat gks-stat--success">
        <span class="gks-stat__label">Идэвхтэй</span>
        <strong class="gks-stat__value">{{ stats.active }}</strong>
      </div>
      <div class="gks-stat">
        <span>Админ</span>
        <strong>{{ stats.admins }}</strong>
      </div>
      <div class="gks-stat" :class="{ 'gks-stat--warn': stats.pending > 0 }">
        <span class="gks-stat__label">Урилга хүлээж буй</span>
        <strong class="gks-stat__value">{{ stats.pending }}</strong>
      </div>
    </div>

    <DsCard v-if="formOpen" :title="editingId ? 'Хэрэглэгчийн мэдээлэл засах' : 'Шинэ хэрэглэгч бүртгэх'">
      <form class="gks-form-grid" @submit.prevent="submit">
        <DsInput v-model="form.name" label="Нэр" required />
        <DsInput v-model="form.email" label="Имэйл" type="email" required />
        <DsInput v-model="form.phone" label="Утас" />
        <DsSelect
          v-model="form.role"
          label="Эрхийн түвшин"
          :options="ROLE_OPTIONS"
          :disabled="editingSelf"
          :hint="editingSelf ? 'Өөрийнхөө эрхийг өөрчлөх боломжгүй' : undefined"
        />
        <div v-if="!editingId" class="gks-form-grid__full gks-staff__password">
          <DsInput
            v-model="form.password"
            label="Нууц үг"
            autocomplete="off"
            hint="Хоосон орхивол имэйлээр урилга илгээж, хэрэглэгч өөрөө тохируулна."
          />
          <DsButton variant="secondary" icon-left="dices" @click="form.password = generatePassword()">
            Санамсаргүй үүсгэх
          </DsButton>
        </div>
        <footer class="gks-form-actions gks-form-grid__full">
          <DsButton variant="ghost" :disabled="submitting" @click="closeForm">Болих</DsButton>
          <DsButton type="submit" variant="accent" icon-left="check" :loading="submitting">
            {{ editingId ? 'Хадгалах' : form.password ? 'Бүртгэх' : 'Бүртгэх ба урилга илгээх' }}
          </DsButton>
        </footer>
      </form>
    </DsCard>

    <DsCard title="Хэрэглэгчид">
      <div class="gks-filters">
        <DsInput
          v-model="search"
          class="gks-filters__search"
          type="search"
          icon-left="search"
          placeholder="Нэр, имэйл, утсаар хайх"
          aria-label="Хэрэглэгч хайх"
        />
        <DsSelect v-model="roleFilter" :options="ROLE_FILTER_OPTIONS" aria-label="Эрхээр шүүх" />
        <DsSelect v-model="statusFilter" :options="STATUS_FILTER_OPTIONS" aria-label="Төлөвөөр шүүх" />
      </div>

      <p v-if="pending" class="gks-muted">Уншиж байна…</p>
      <p v-else-if="!rows.length" class="gks-empty">Хэрэглэгч бүртгэгдээгүй байна.</p>
      <p v-else-if="!visible.length" class="gks-empty">Шүүлтүүрт тохирох хэрэглэгч алга.</p>

      <p v-if="!pending && visible.length" class="gks-result-count gks-tnum gks-staff__count">
        {{ visible.length }} хэрэглэгч
      </p>

      <div v-if="!pending && visible.length" class="gks-table-wrap gks-table-wrap--auto">
        <table class="gks-table gks-table--cards">
          <thead>
            <tr>
              <th scope="col">Хэрэглэгч</th>
              <th scope="col">Эрх</th>
              <th scope="col">Төлөв</th>
              <th scope="col" class="gks-table__num">Ачаалал</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visible"
              :key="row.id"
              :class="{ 'gks-staff__row--off': !row.isActive, 'gks-staff__row--editing': editingId === row.id }"
            >
              <td data-label="Хэрэглэгч">
                <p class="gks-cell-name">
                  {{ row.name ?? '—' }}
                  <DsTag v-if="isSelf(row)">Та</DsTag>
                </p>
                <p class="gks-cell-sub gks-tnum">{{ row.email }}</p>
                <p v-if="row.phone" class="gks-cell-sub gks-tnum">{{ row.phone }}</p>
              </td>
              <td data-label="Эрх">
                <DsSelect
                  :model-value="row.role"
                  :options="ROLE_OPTIONS"
                  aria-label="Эрхийн түвшин"
                  :disabled="isSelf(row) || busyId === row.id"
                  @update:model-value="(value: string) => patch(row, { role: value as UserRole })"
                />
              </td>
              <td data-label="Төлөв">
                <div class="gks-chips">
                  <DsBadge :tone="row.isActive ? 'success' : 'neutral'">
                    {{ row.isActive ? 'Идэвхтэй' : 'Идэвхгүй' }}
                  </DsBadge>
                  <DsBadge v-if="!row.hasLogin" tone="warning">Идэвхжүүлээгүй</DsBadge>
                </div>
              </td>
              <td class="gks-table__num gks-tnum" data-label="Ачаалал">{{ row.workload }}</td>
              <td class="gks-table__actions">
                <template v-if="passwordId === row.id">
                  <div class="gks-staff__pwd-field">
                    <DsInput
                      v-model="passwordValue"
                      aria-label="Шинэ нууц үг"
                      autocomplete="off"
                      @keyup.enter="savePassword(row)"
                    />
                  </div>
                  <DsButton
                    variant="ghost"
                    size="sm"
                    icon-left="dices"
                    :disabled="busyId === row.id"
                    title="Санамсаргүй үүсгэх"
                    @click="passwordValue = generatePassword()"
                  >
                    Үүсгэх
                  </DsButton>
                  <DsButton variant="ghost" size="sm" :disabled="busyId === row.id" @click="passwordId = null">
                    Болих
                  </DsButton>
                  <DsButton variant="accent" size="sm" :loading="busyId === row.id" @click="savePassword(row)">
                    Хадгалах
                  </DsButton>
                </template>
                <template v-else-if="confirmingId === row.id">
                  <span class="gks-staff__confirm">Устгах уу?</span>
                  <DsButton variant="ghost" size="sm" :disabled="busyId === row.id" @click="confirmingId = null">
                    Үгүй
                  </DsButton>
                  <DsButton variant="danger" size="sm" :loading="busyId === row.id" @click="remove(row)">
                    Тийм, устга
                  </DsButton>
                </template>
                <template v-else>
                  <DsButton variant="secondary" size="sm" icon-left="pencil" @click="startEdit(row)">
                    Засах
                  </DsButton>
                  <DsButton
                    variant="secondary"
                    size="sm"
                    icon-left="key-round"
                    :disabled="isSelf(row) || busyId === row.id"
                    :title="isSelf(row) ? 'Өөрийн нууц үгээ “Миний бүртгэл” хэсгээс солино' : 'Нууц үг шууд тохоох'"
                    @click="startPassword(row)"
                  >
                    Нууц үг
                  </DsButton>
                  <DsButton
                    v-if="!row.hasLogin"
                    variant="secondary"
                    size="sm"
                    icon-left="mail"
                    :loading="busyId === row.id"
                    @click="resendInvite(row)"
                  >
                    Урилга
                  </DsButton>
                  <DsButton
                    variant="secondary"
                    size="sm"
                    :icon-left="row.isActive ? 'user-x' : 'user-check'"
                    :disabled="isSelf(row) || busyId === row.id"
                    :title="isSelf(row) ? 'Өөрийн бүртгэлээ идэвхгүй болгох боломжгүй' : undefined"
                    @click="patch(row, { isActive: !row.isActive })"
                  >
                    {{ row.isActive ? 'Идэвхгүй болгох' : 'Сэргээх' }}
                  </DsButton>
                  <DsButton
                    variant="ghost"
                    size="sm"
                    icon-left="trash-2"
                    :disabled="!row.deletable || isSelf(row)"
                    :title="!row.deletable || isSelf(row) ? deleteHint(row) : undefined"
                    @click="confirmingId = row.id"
                  >
                    Устгах
                  </DsButton>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="gks-staff__foot">
        Ажилласан түүхтэй хэрэглэгчийг устгахгүй — <strong>идэвхгүй болгоно</strong>. Ингэснээр гэрээ,
        материалын шалгалт, аудитын бичлэг дээрх нэр нь хэвээр үлдэнэ.
        Нууц үг солиход тухайн хүний нээлттэй бүх сесс хаагдана; өөрийн нууц үгээ
        <NuxtLink to="/admin/account">Миний бүртгэл</NuxtLink> хэсгээс солино.
      </p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-staff__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-staff__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-staff__row--off { opacity: .6; }
.gks-staff__row--editing td { background: var(--surface-selected); }
.gks-staff__confirm { font-size: var(--fs-body-sm); color: var(--danger-fg); margin-right: var(--sp-2); }
.gks-staff__password { display: flex; align-items: flex-end; gap: var(--sp-3); }
.gks-staff__password > :first-child { flex: 1; }
.gks-staff__pwd-field { display: inline-block; min-width: 200px; vertical-align: middle; }
.gks-staff__count { margin: var(--sp-4) 0 var(--sp-2); }
.gks-staff__foot { margin-top: var(--sp-4); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-table__actions > * + * { margin-left: var(--sp-2); }
</style>
