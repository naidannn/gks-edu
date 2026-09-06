/**
 * A machine code for a template staff typed by hand (1D-22).
 *
 * `DocumentTemplate.code` is the stable handle rules and seeds refer to, and
 * the admin form makes a human choose one. Nobody adding "Банкны тодорхойлолт"
 * to one client's checklist should have to, so the name is transliterated into
 * the same SCREAMING_SNAKE shape the seeded codes use.
 */

/** Mongolian Cyrillic → Latin, the way names are spelled on a passport. */
const TRANSLITERATION: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

const MAX_LENGTH = 48;

/**
 * `Банкны тодорхойлолт` → `BANKNY_TODORKHOILOLT`. A name with nothing
 * transliterable left in it (digits only, say) still has to satisfy the
 * `^[A-Z][A-Z0-9_]{1,63}$` shape the admin DTO validates, so it falls back to
 * a prefixed form rather than to something the form would later reject.
 */
export function toTemplateCode(nameMn: string): string {
  const latin = [...nameMn.toLowerCase()]
    .map((char) => TRANSLITERATION[char] ?? char)
    .join('')
    .toUpperCase();

  const code = latin
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/_+$/, '');

  return /^[A-Z]/.test(code) && code.length > 1 ? code : `CUSTOM_${code || 'MATERIAL'}`.slice(0, MAX_LENGTH);
}

/** `CODE`, `CODE_2`, `CODE_3` … — the first form the taken list does not hold. */
export function uniqueTemplateCode(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, MAX_LENGTH - 4)}_${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base.slice(0, MAX_LENGTH - 14)}_${Date.now().toString(36).toUpperCase()}`;
}
