import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

const KRW = 'KRW';

/** Midnight UTC of the given day — `FxRate.date` is a `@db.Date` column. */
function dayOf(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * 1E-07 — the MNT-per-KRW rate a school invoice is priced at.
 *
 * An invoice *snapshots* the rate (`SchoolInvoice.fxRate`), so this table is a
 * source of today's number and an audit trail, never a live join: a rate move
 * tomorrow must not change what a client was told to pay (§8).
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async list(currency = KRW, take = 30) {
    return this.prisma.fxRate.findMany({ where: { currency }, orderBy: { date: 'desc' }, take });
  }

  /** The most recent stored rate; falls back to the configured constant when the table is empty. */
  async current(currency = KRW): Promise<{ rate: number; date: Date; source: string }> {
    const latest = await this.prisma.fxRate.findFirst({ where: { currency }, orderBy: { date: 'desc' } });
    if (latest) return { rate: Number(latest.rate), date: latest.date, source: latest.source };

    if (currency !== KRW) throw new NotFoundException(`${currency} валютын ханш бүртгэгдээгүй байна`);
    const fallback = this.config.getOrThrow<number>('fx.fallbackKrwRate');
    this.logger.warn(`Ханшийн хүснэгт хоосон байна — тохиргооны ${fallback} утгыг ашиглалаа`);
    return { rate: fallback, date: dayOf(new Date()), source: 'config-fallback' };
  }

  async upsert(rate: number, date: Date, source: string, currency = KRW) {
    const day = dayOf(date);
    return this.prisma.fxRate.upsert({
      where: { currency_date: { currency, date: day } },
      update: { rate, source },
      create: { currency, date: day, rate, source },
    });
  }

  /**
   * Pulls today's Mongolbank reference rate from the configured feed. That
   * feed's shape is not a published contract, so anything unparseable is logged
   * and skipped rather than thrown — the invoice screen keeps working off the
   * last known rate, and staff can always type the rate in by hand.
   */
  async refreshFromMongolbank(): Promise<{ rate: number; date: Date } | null> {
    const url = this.config.getOrThrow<string>('fx.ratesUrl');

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const rate = extractKrwRate(await response.json());
      if (rate === null) {
        this.logger.warn('Ханшийн эх сурвалжийн хариунаас KRW-г таньсангүй');
        return null;
      }

      const today = dayOf(new Date());
      await this.upsert(rate, today, 'mongolbank');
      this.logger.log(`KRW ханш шинэчлэгдлээ: ${rate}₮`);
      return { rate, date: today };
    } catch (error) {
      this.logger.warn(`Монголбанкны ханш татахад алдаа гарлаа: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

/**
 * Mongolbank quotes KRW per 1,000 won on some surfaces and per 1 won on others.
 * Anything above 100₮ can only be the per-1,000 quote, so it is normalised down.
 */
export function extractKrwRate(payload: unknown): number | null {
  const raw = findKrw(payload);
  if (raw === null || !Number.isFinite(raw) || raw <= 0) return null;
  return raw > 100 ? raw / 1000 : raw;
}

function findKrw(node: unknown, depth = 0): number | null {
  if (depth > 6 || node === null || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const entry of node) {
      const found = findKrw(entry, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;

  // Shape A: a flat map keyed by currency code — { "KRW": "2.55", … }
  for (const [key, value] of Object.entries(record)) {
    if (key.toUpperCase() === 'KRW' && (typeof value === 'number' || typeof value === 'string')) {
      return Number(value);
    }
  }

  // Shape B: a row object — { code: "KRW", rate: "2.55" }
  const code = record.code ?? record.currency ?? record.currency_code;
  if (typeof code === 'string' && code.toUpperCase().includes('KRW')) {
    const value = record.rate ?? record.value ?? record.rate_float ?? record.mid;
    if (typeof value === 'number' || typeof value === 'string') return Number(value);
  }

  for (const value of Object.values(record)) {
    const found = findKrw(value, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
