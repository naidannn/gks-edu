import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface QpayInvoice {
  invoiceId: string;
  qrText: string;
  qrImage: string | null;
}

export interface QpayCheckResult {
  paid: boolean;
  qpayPaymentId?: string;
}

/**
 * QPay v2 REST client (1C-12): merchant auth (Basic → Bearer token, cached),
 * invoice creation, payment-check. Production runs against the live merchant
 * `GKS_EDU` on `merchant.qpay.mn` — there is no sandbox account, and the
 * sandbox host rejects these credentials, so `QPAY_MOCK=true` stays the
 * default everywhere else: it fakes every response instead of calling QPay,
 * which keeps the flow runnable in development without minting real invoices.
 */
@Injectable()
export class QpayClientService {
  private readonly logger = new Logger(QpayClientService.name);
  private accessToken?: string;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  async createInvoice(params: { invoiceNo: string; amount: number; description: string; callbackUrl: string }): Promise<QpayInvoice> {
    if (this.mock) {
      const invoiceId = `MOCK-${randomUUID()}`;
      this.logger.log(`[QPAY_MOCK] invoice ${invoiceId} for ${params.amount}₮ (${params.description})`);
      return { invoiceId, qrText: `mock-qpay-invoice:${invoiceId}`, qrImage: null };
    }

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/invoice`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_code: this.config.getOrThrow<string>('qpay.invoiceCode'),
        sender_invoice_no: params.invoiceNo,
        invoice_receiver_code: 'terminal',
        invoice_description: params.description,
        amount: params.amount,
        callback_url: params.callbackUrl,
      }),
    });
    if (!response.ok) {
      throw new Error(`QPay invoice creation failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { invoice_id: string; qr_text: string; qr_image?: string };
    return { invoiceId: body.invoice_id, qrText: body.qr_text, qrImage: body.qr_image ?? null };
  }

  /**
   * Independently re-verifies with QPay rather than trusting a webhook body
   * (ARCHITECTURE.md §16 — QPay webhook must check a signature; QPay v2's
   * public callback carries no verifiable one, so the callback is treated
   * only as a "check now" trigger and this call is the actual source of truth).
   */
  async checkPayment(invoiceId: string): Promise<QpayCheckResult> {
    if (this.mock) return { paid: false };

    const token = await this.getAccessToken();
    const response = await fetch(`${this.baseUrl}/payment/check`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ object_type: 'INVOICE', object_id: invoiceId }),
    });
    if (!response.ok) {
      throw new Error(`QPay payment check failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { rows?: { payment_id: string; payment_status: string }[] };
    const paidRow = body.rows?.find((row) => row.payment_status === 'PAID');
    return paidRow ? { paid: true, qpayPaymentId: paidRow.payment_id } : { paid: false };
  }

  private get mock(): boolean {
    return this.config.get<boolean>('qpay.mock') ?? true;
  }

  private get baseUrl(): string {
    return this.config.getOrThrow<string>('qpay.baseUrl');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) return this.accessToken;

    const username = this.config.getOrThrow<string>('qpay.username');
    const password = this.config.getOrThrow<string>('qpay.password');
    const basic = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!response.ok) {
      throw new Error(`QPay auth failed: ${response.status} ${await response.text()}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in?: number };
    this.accessToken = body.access_token;
    this.tokenExpiresAt = expiryFromQpay(body.expires_in);
    return this.accessToken;
  }
}

/**
 * QPay's `expires_in` is not the OAuth duration the name promises — production
 * answers with an absolute Unix timestamp (`now + 86400`, in seconds). Added to
 * `Date.now()` that caches the token for thirty thousand years, so it is never
 * refreshed and every call 401s a day after the process starts. Anything large
 * enough to be a timestamp is therefore read as one; a genuine duration is still
 * honoured, in case QPay ever sends what the field says.
 */
export function expiryFromQpay(expiresIn: number | undefined, now = Date.now()): number {
  /** No plausible token lives 31 years, so a value this big is a date. */
  const EPOCH_THRESHOLD_SECONDS = 1_000_000_000;
  /** Refresh a little early rather than racing QPay's own clock. */
  const SKEW_MS = 30_000;

  const seconds = expiresIn ?? 3600;
  const expiresAt = seconds >= EPOCH_THRESHOLD_SECONDS ? seconds * 1000 : now + seconds * 1000;
  return expiresAt - SKEW_MS;
}
