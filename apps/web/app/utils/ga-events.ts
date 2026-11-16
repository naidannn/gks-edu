/**
 * Meta event → GA4 event.
 *
 * The site reports every funnel step to Meta already (1A-38), and GA4 should
 * see the same steps, once each, under GA4's own recommended names — so
 * `generate_lead`, `sign_up`, `begin_checkout` and `purchase` light up the
 * built-in funnel reports and can be marked as key events. Rather than a second
 * call beside every `meta.track(...)`, the Meta plugin announces each event on
 * the `tracking:event` hook and the GA plugin translates it with this table, so
 * the two cannot drift apart.
 *
 * `PageView` is absent on purpose: GA has its own `page_view`.
 */

/** The subset of Meta `custom_data` the funnel sends. */
export interface TrackedData {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  search_string?: string;
  value?: number;
  currency?: string;
}

export interface TrackedEvent {
  /** Meta's event name, as passed to `meta.track(...)`. */
  name: string;
  /** The id shared with the pixel and the Conversions API; a payment id for money events. */
  eventId: string;
  data?: TrackedData;
}

export interface GaEvent {
  name: string;
  params: Record<string, unknown>;
}

function items(data?: TrackedData): { item_id: string; item_name?: string }[] | undefined {
  const ids = data?.content_ids?.filter(Boolean);
  if (!ids?.length) return undefined;
  return ids.map((id) => ({ item_id: id, ...(data?.content_name ? { item_name: data.content_name } : {}) }));
}

function money(data?: TrackedData): Record<string, unknown> {
  if (typeof data?.value !== 'number') return {};
  return { value: data.value, currency: data.currency ?? 'MNT' };
}

export function toGaEvent(event: TrackedEvent): GaEvent | null {
  const { data } = event;

  switch (event.name) {
    case 'ViewContent':
      return { name: 'view_item', params: { ...(items(data) ? { items: items(data) } : {}), ...money(data) } };
    case 'Search':
      return {
        name: 'search',
        params: {
          search_term: data?.search_string ?? '',
          ...(data?.content_category ? { content_category: data.content_category } : {}),
        },
      };
    case 'AddToWishlist':
      return { name: 'add_to_wishlist', params: { ...(items(data) ? { items: items(data) } : {}) } };
    case 'Contact':
      return { name: 'contact', params: { method: data?.content_category ?? 'unknown' } };
    case 'GksCheckCompleted':
      return { name: 'gks_check_completed', params: { ...(data?.content_category ? { verdict: data.content_category } : {}) } };
    case 'Lead':
      return { name: 'generate_lead', params: { ...(data?.content_name ? { lead_source: data.content_name } : {}), ...money(data) } };
    case 'CompleteRegistration':
      return { name: 'sign_up', params: { method: 'email' } };
    case 'InitiateCheckout':
      return { name: 'begin_checkout', params: { ...money(data), ...(items(data) ? { items: items(data) } : {}) } };
    case 'Purchase':
      // GA4 deduplicates on `transaction_id`, which is how the server's copy
      // of the same payment (Measurement Protocol) collapses into this one.
      return {
        name: 'purchase',
        params: { transaction_id: event.eventId, ...money(data), ...(items(data) ? { items: items(data) } : {}) },
      };
    default:
      return null;
  }
}
