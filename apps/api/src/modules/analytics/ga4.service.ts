import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What a server-reported GA4 purchase carries. */
export interface Ga4PurchaseInput {
  /** The dedup key: GA4 counts one `purchase` per `transaction_id`, whichever side sent it. */
  transactionId: string;
  userId: string;
  valueMnt: number;
  kind: string;
  itemName: string;
  occurredAt?: Date;
}

/**
 * The server half of GA4 (Measurement Protocol) — `purchase` only.
 *
 * The browser reports every funnel step to GA4 on its own; the one it cannot be
 * trusted with is the money. A QPay payment is confirmed by a webhook, often
 * after the payer has closed the tab, and a visitor running an ad blocker never
 * reaches `googletagmanager.com` at all. So the confirmed payment is reported
 * from here as well, under the same `transaction_id` the browser uses (the
 * payment id) — GA4 deduplicates purchases on it, the same way Meta does on
 * `event_id`.
 *
 * Nothing here has a browser to read the `_ga` cookie from, so `client_id` is
 * derived from the user id and the event also carries `user_id`. GA4 stitches
 * the two together when the site reports the signed-in user, which the web
 * plugin does.
 *
 * Like `MetaEventsService`, it never throws: measurement must not fail a
 * payment. With the measurement id or secret unset it logs instead of sending.
 */
@Injectable()
export class Ga4Service {
  private readonly logger = new Logger(Ga4Service.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.measurementId && this.apiSecret && !this.config.get<boolean>('ga4.mock'));
  }

  private get measurementId(): string {
    return this.config.get<string>('ga4.measurementId') ?? '';
  }

  private get apiSecret(): string {
    return this.config.get<string>('ga4.apiSecret') ?? '';
  }

  async trackPurchase(input: Ga4PurchaseInput): Promise<void> {
    try {
      if (!this.enabled) {
        this.logger.debug(`[mock] GA4 purchase (${input.transactionId})`);
        return;
      }

      const timestampMicros = (input.occurredAt ?? new Date()).getTime() * 1000;
      // The secret goes in the query string because Measurement Protocol offers
      // nowhere else for it; it is write-only and scoped to one stream.
      const url =
        `https://www.google-analytics.com/mp/collect`
        + `?measurement_id=${encodeURIComponent(this.measurementId)}`
        + `&api_secret=${encodeURIComponent(this.apiSecret)}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: `gks.${input.userId}`,
          user_id: input.userId,
          timestamp_micros: timestampMicros,
          events: [
            {
              name: 'purchase',
              params: {
                transaction_id: input.transactionId,
                value: input.valueMnt,
                currency: 'MNT',
                items: [{ item_id: input.kind, item_name: input.itemName, quantity: 1, price: input.valueMnt }],
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.get<number>('ga4.timeoutMs') ?? 10_000),
      });

      // Measurement Protocol answers 2xx to everything, including malformed
      // events; only a transport-level failure is visible here.
      if (!response.ok) this.logger.warn(`GA4 purchase илгээгдсэнгүй: HTTP ${response.status}`);
    } catch (error) {
      this.logger.warn(`GA4 purchase илгээгдсэнгүй: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
