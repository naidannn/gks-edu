import { type DecimalLike, toNumber } from '../../common/utils/decimal.js';

/**
 * Amounts spelled out in Mongolian, the way the signed contract writes them:
 * `5,000,000.00 (Таван сая төгрөг)`.
 *
 * A Mongolian numeral takes its attributive form in front of the word it
 * counts (`тав` → `таван сая`, `хоёр зуун гучин тав`) and its plain form at
 * the end of the phrase. The scale words themselves are the exception: they
 * stay plain in front of the next group — `нэг мянга таван зуу`, not
 * `нэг мянган таван зуу` — so each word is carried as a triple.
 */
type Numeral = readonly [plain: string, attributive: string, isScale?: true];

const ONES: readonly Numeral[] = [
  ['', ''],
  ['нэг', 'нэг'],
  ['хоёр', 'хоёр'],
  ['гурав', 'гурван'],
  ['дөрөв', 'дөрвөн'],
  ['тав', 'таван'],
  ['зургаа', 'зургаан'],
  ['долоо', 'долоон'],
  ['найм', 'найман'],
  ['ес', 'есөн'],
];

const TENS: readonly Numeral[] = [
  ['', ''],
  ['арав', 'арван'],
  ['хорь', 'хорин'],
  ['гуч', 'гучин'],
  ['дөч', 'дөчин'],
  ['тавь', 'тавин'],
  ['жар', 'жаран'],
  ['дал', 'далан'],
  ['ная', 'наян'],
  ['ер', 'ерэн'],
];

const HUNDRED: Numeral = ['зуу', 'зуун'];
/** Index = power of a thousand: 1 → мянга, 2 → сая, 3 → тэрбум. */
const SCALES: readonly Numeral[] = [
  ['', ''],
  ['мянга', 'мянган', true],
  ['сая', 'сая', true],
  ['тэрбум', 'тэрбум', true],
];

/** The 0–999 part of one group, as numeral pairs. */
function groupNumerals(group: number): Numeral[] {
  const words: Numeral[] = [];
  const hundreds = Math.floor(group / 100);
  const tens = Math.floor((group % 100) / 10);
  const ones = group % 10;

  if (hundreds > 0) words.push(ONES[hundreds]!, HUNDRED);
  if (tens > 0) words.push(TENS[tens]!);
  if (ones > 0) words.push(ONES[ones]!);
  return words;
}

/**
 * `3500000` → `гурван сая таван зуун мянга`. Fractions are rounded away: the
 * office writes whole tugriks, and `ServicePricing` has never carried a
 * fractional price.
 */
export function amountInWordsMn(value: DecimalLike): string {
  const amount = Math.round(toNumber(value));
  if (!Number.isFinite(amount)) return '';
  if (amount === 0) return 'тэг';
  if (amount < 0) return `хасах ${amountInWordsMn(-amount)}`;

  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  if (groups.length > SCALES.length) return amount.toString();

  const words: Numeral[] = [];
  for (let scale = groups.length - 1; scale >= 0; scale -= 1) {
    const group = groups[scale]!;
    if (group === 0) continue;
    words.push(...groupNumerals(group));
    if (scale > 0) words.push(SCALES[scale]!);
  }

  return words
    .map(([plain, attributive, isScale], i) => (isScale || i === words.length - 1 ? plain : attributive))
    .join(' ');
}

/** Same, capitalised — contracts open the bracket with an upper-case letter. */
export function amountInWordsMnCapitalized(value: DecimalLike): string {
  const words = amountInWordsMn(value);
  return words ? words[0]!.toUpperCase() + words.slice(1) : words;
}
