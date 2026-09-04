/** Anything `Number(x.toString())`-convertible — covers `Prisma.Decimal`, plain numbers, and strings. */
export type DecimalLike = number | string | { toString(): string };

export function toNumber(value: DecimalLike): number {
  return typeof value === 'number' ? value : Number(value.toString());
}
