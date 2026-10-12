import type { LeadListItem, PaginatedResult } from '@gks/shared';
import { normalizedPhone, stripPhone } from '~/utils/lead-form';

export interface ClientPhoneMatch {
  id: string;
  code: string;
  lastName: string;
  firstName: string;
  phone: string;
}

/**
 * Who this phone number already is, looked up as staff type it (1B-26): the
 * clients that carry it and the leads filed under it. Nothing is blocked —
 * siblings share a parent's phone — the forms only show what is there so the
 * consultant can open the existing record instead of starting a second one.
 */
export function useExistingPerson(phone: () => string) {
  const api = useApi();
  const clients = ref<ClientPhoneMatch[]>([]);
  const leads = ref<LeadListItem[]>([]);
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(phone, (value) => {
    clearTimeout(timer);
    if (!/^(976)?\d{8}$/.test(stripPhone(value))) {
      clients.value = [];
      leads.value = [];
      return;
    }
    // Search the stored form, not the typed one — a saved number never carries
    // its country code.
    const digits = normalizedPhone(value);
    timer = setTimeout(async () => {
      const [byClient, byLead] = await Promise.all([
        api
          .get<{ phoneMatches: ClientPhoneMatch[] }>('/clients/check-duplicates', { query: { phone: digits } })
          .then((found) => found.phoneMatches)
          .catch(() => []),
        api
          .get<PaginatedResult<LeadListItem>>('/leads', { query: { q: digits, limit: 5 } })
          .then((found) => found.items)
          .catch(() => []),
      ]);
      clients.value = byClient;
      leads.value = byLead;
    }, 400);
  });
  onBeforeUnmount(() => clearTimeout(timer));

  return { clients, leads };
}
