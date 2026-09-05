import { type DecimalLike, toNumber } from '../../common/utils/decimal.js';

/** Formats a plain number as `1,200,000` without pulling in full-ICU locale data. */
export function formatAmount(value: DecimalLike): string {
  const n = Math.round(toNumber(value));
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The same number with the two decimals the signed contract prints:
 * `5,000,000.00`.
 */
export function formatAmountExact(value: DecimalLike): string {
  const n = toNumber(value);
  const [whole, fraction = '00'] = Math.abs(n).toFixed(2).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}${grouped}.${fraction}`;
}

/**
 * Substitutes `{{token}}` placeholders with case-specific data (1C-06). Tokens
 * with no entry in `data` — the legal boilerplate an admin writes directly
 * into the template body (obligations, refund terms, …) — are left as-is so
 * an unedited template visibly still needs attention.
 */
export function renderContractBody(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) => data[token] ?? match);
}
