<script setup lang="ts">
import type { FacebookThreadListResponse } from '@gks/shared';

/**
 * "Facebook чат" on a lead or client page (2F) — shown only when a Messenger
 * thread is linked to this record.
 *
 * It renders nothing until it knows, and nothing at all if the request fails:
 * the Facebook inbox is a side door to the record, and a broken side door must
 * not put an error on the page someone came to for something else.
 */
const props = defineProps<{ leadId?: string; clientId?: string }>();

const api = useApi();
const threadId = ref<string | null>(null);

async function look(): Promise<void> {
  threadId.value = null;
  const params = new URLSearchParams({ scope: 'ALL', limit: '1' });
  if (props.leadId) params.set('leadId', props.leadId);
  else if (props.clientId) params.set('clientId', props.clientId);
  else return;
  try {
    const result = await api.get<FacebookThreadListResponse>(`/admin/facebook/threads?${params}`);
    threadId.value = result.items[0]?.id ?? null;
  } catch {
    threadId.value = null;
  }
}

onMounted(look);
watch(() => [props.leadId, props.clientId], look);
</script>

<template>
  <DsButton
    v-if="threadId"
    size="sm"
    variant="secondary"
    icon-left="facebook"
    @click="navigateTo(`/admin/facebook?thread=${threadId}`)"
  >
    Facebook чат
  </DsButton>
</template>
