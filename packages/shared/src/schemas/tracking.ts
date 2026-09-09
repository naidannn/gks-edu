import { z } from 'zod';

/**
 * What the browser knows about a Meta ad click, attached to the requests that
 * are themselves conversions — the consultation form and the registration form
 * (1A-38).
 *
 * The point is deduplication. The pixel fires `Lead` in the browser and the API
 * fires `Lead` from the server for the same person; Meta counts them once only
 * if both carry the same `eventId`. The browser is the one that can generate it
 * before either side has acted, so it does, and sends it along with the payload
 * that causes the server-side event.
 *
 * `fbp` / `fbc` are Meta's own cookies, and `externalId` is our first-party
 * visitor id. Sending them lets the *server* event carry the click context even
 * when an ad blocker stopped the pixel from ever loading.
 */
export const metaTrackingSchema = z.object({
  eventId: z.string().max(64).optional(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(400).optional(),
  externalId: z.string().max(100).optional(),
  eventSourceUrl: z.string().max(500).optional(),
});

export type MetaTracking = z.infer<typeof metaTrackingSchema>;
