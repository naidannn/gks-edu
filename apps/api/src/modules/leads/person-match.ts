/**
 * Is this the same person? (1B-26)
 *
 * One person reaches the office through the website form, the assistant,
 * Messenger and the front desk, and each of those used to leave its own lead —
 * in production on 2026-10-12, 28 of 67 clients had an unlinked lead under
 * their number. The phone is the identity every channel collects, so it is the
 * key. It is not enough on its own: a parent enquiring for two children gives
 * the same number twice. So a phone match also needs the given name to agree,
 * where "agree" survives the Latin/Cyrillic split the data is full of —
 * "Nyambayar" on the office form, "Нямбаяр" on the website.
 *
 * Only the given name is compared. The surname (овог) is the father's name and
 * siblings share it, so it says nothing here.
 */

/** The last eight digits — what every Mongolian mobile number is, whatever prefix was typed. */
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? digits.slice(-8) : null;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ү: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'ii', ь: '', э: 'e',
  ю: 'yu', я: 'ya',
};

/**
 * Names nobody actually gave: the assistant writes "—" for a half it was not
 * told, and staff filing a Messenger thread have typed "Үл мэдэгдэх".
 */
const PLACEHOLDER = /^(?:[-—–.\s]*|үл(?:\s.*)?|тодорхойгүй|нэргүй|unknown)$/i;

/**
 * A spelling-insensitive skeleton of a given name. Romanisation of Mongolian
 * is not standardised, so the letters people swap freely collapse together:
 * ө/о/ү/у → u ("Tuguldur" = "Төгөлдөр", "Monkh" = "Мөнх"), kh → h, ts → c,
 * zh → j, and doubled letters → one.
 */
export function nameSkeleton(name: string | null | undefined): string {
  const raw = (name ?? '').trim().toLowerCase();
  if (PLACEHOLDER.test(raw)) return '';

  const latin = [...raw.normalize('NFD').replace(/\p{M}/gu, '')]
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join('')
    .replace(/[^a-z]/g, '');

  return latin
    .replace(/kh/g, 'h')
    .replace(/ts/g, 'c')
    .replace(/zh/g, 'j')
    .replace(/o/g, 'u')
    .replace(/(.)\1+/g, '$1');
}

/**
 * True when two given names can belong to the same person. An unknown name
 * on either side is not evidence against it — the number already matched.
 */
export function sameGivenName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = nameSkeleton(a);
  const right = nameSkeleton(b);
  return !left || !right || left === right;
}
