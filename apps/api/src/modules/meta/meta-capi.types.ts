import type { MetaUserData, MetaUserIdentity } from './meta-user-data.js';

/**
 * Where the conversion actually happened. Meta uses this to decide how the
 * event may be attributed, so it is never a formality:
 * - `website` — the person was on gksedu.mn when it happened, or was on it
 *   when they started the thing that finished later (a QPay payment).
 * - `system_generated` — our own logic produced it with nobody present.
 * - `physical_store` / `phone_call` — the office, not the site.
 */
export type MetaActionSource =
  | 'website'
  | 'email'
  | 'app'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'system_generated'
  | 'business_messaging'
  | 'other';

/**
 * Meta's standard events, restricted to the ones this funnel actually has.
 * Everything else would be a custom event, and a custom event cannot be
 * optimised for in the ad-set the way a standard one can.
 */
export const META_STANDARD_EVENTS = [
  'PageView',
  'ViewContent',
  'Search',
  'AddToWishlist',
  'Lead',
  'Contact',
  'CompleteRegistration',
  'SubmitApplication',
  'Schedule',
  'InitiateCheckout',
  'Purchase',
] as const;

export type MetaStandardEvent = (typeof META_STANDARD_EVENTS)[number];

/**
 * Events this funnel has that Meta has no name for. A custom event cannot be
 * an ad-set's optimisation goal, but it can build an audience — and "finished
 * the GKS self-check" is the most qualified audience on the site.
 */
export const META_CUSTOM_EVENTS = ['GksCheckCompleted'] as const;

export type MetaCustomEvent = (typeof META_CUSTOM_EVENTS)[number];

/** Custom data. Meta names these fields; the funnel's own vocabulary goes in `content_*`. */
export interface MetaCustomData {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  search_string?: string;
  value?: number;
  currency?: string;
  num_items?: number;
  status?: string;
  order_id?: string;
  [key: string]: unknown;
}

/** What a caller in a domain module describes; hashing happens on the way to the queue. */
export interface MetaTrackInput {
  eventName: MetaStandardEvent | (string & {});
  /**
   * The dedup key. When the browser fires the same conversion, both sides must
   * use the same value or Meta counts one person twice — so it is either the
   * id the browser generated and sent us, or something both sides can derive
   * (a payment id).
   */
  eventId: string;
  eventTime?: Date;
  actionSource: MetaActionSource;
  eventSourceUrl?: string | null;
  identity: MetaUserIdentity;
  customData?: MetaCustomData;
}

/** One event in the shape the Graph API takes — already hashed, safe to persist. */
export interface MetaServerEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: MetaActionSource;
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
}
