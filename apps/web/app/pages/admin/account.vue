<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * Every staff member's own corner of the CRM. It exists for one thing today —
 * changing your own password — which is deliberately not on the system-user
 * register: an admin resets *other people's* passwords there, and re-keys
 * their own here, where the current password has to be typed.
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });
useHead({ title: 'Миний бүртгэл' });

const auth = useAuthStore();
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <h1 class="gks-page__title">Миний бүртгэл</h1>
        <p class="gks-page__hint">
          {{ auth.user?.email }} · {{ auth.user?.role ? ROLE_LABELS[auth.user.role] : '' }}
        </p>
      </div>
    </header>

    <AuthChangePassword />
  </div>
</template>
