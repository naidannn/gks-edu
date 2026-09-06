/**
 * How a Korean school is named on screen — in one place, like the enum labels
 * next door in `labels.ts`.
 *
 * The English name leads. The Mongolian transliteration is not settled between
 * sources, and staff work from paperwork — an admission letter, an invoice, the
 * school's own site — where the English name is what is printed. Leading with
 * it is what makes a row on a CRM screen matchable against the document in
 * someone's hand. The Mongolian name is not dropped: it goes on the line
 * underneath, and it stays searchable.
 */

/** Anything a screen has to name a school from. Both names are optional so a
 *  narrow payload (a notification, an older cached row) still renders. */
export interface NamedUniversity {
  nameEn?: string | null;
  nameMn?: string | null;
  nameKo?: string | null;
  cityMn?: string | null;
}

/** Shown where an empty school column would otherwise read as a blank cell. */
export const NO_UNIVERSITY_LABEL = 'Сургууль сонгоогүй';

/** The name a school is listed under. */
export function universityName(university: NamedUniversity | null | undefined, fallback = '—'): string {
  if (!university) return fallback;
  return university.nameEn?.trim() || university.nameMn?.trim() || fallback;
}

/**
 * The quieter second line: the Mongolian name, and the city when the caller
 * has one. `null` when it would only repeat what `universityName` already said.
 */
export function universitySubName(university: NamedUniversity | null | undefined): string | null {
  if (!university) return null;

  const name = universityName(university, '');
  const parts = [university.nameMn?.trim(), university.cityMn?.trim()].filter(
    (part): part is string => Boolean(part) && part !== name,
  );

  return parts.length ? parts.join(' · ') : null;
}

/**
 * "Сөүл" or "Ансан, Кёнги" — where a school actually is.
 *
 * Korea's metropolitan cities are their own region, so `cityMn` and `regionMn`
 * are the same word for Seoul, Busan, Daejeon and the rest. Printing both gives
 * "Тэжон, Тэжон", which reads as a bug because it is one.
 */
export function universityPlace(
  university: { cityMn?: string | null; regionMn?: string | null } | null | undefined,
): string {
  const city = university?.cityMn?.trim();
  const region = university?.regionMn?.trim();
  if (!city) return region ?? '';
  if (!region || region === city) return city;
  return `${city}, ${region}`;
}

/** Both lines in one string, for a `<option>` or a one-line cell. */
export function universityLabel(university: NamedUniversity | null | undefined, fallback = '—'): string {
  const name = universityName(university, fallback);
  const sub = universitySubName(university);
  return sub ? `${name} · ${sub}` : name;
}

/**
 * The haystack a school search matches against. Every name it might be typed
 * under — English, Mongolian, Korean — plus the city, so "Сөүл" narrows a list
 * of 135 schools the way staff expect it to.
 */
export function universitySearchText(university: NamedUniversity): string {
  return [university.nameEn, university.nameMn, university.nameKo, university.cityMn]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** One row of a school picker: what is displayed, and what it matches on. */
export interface UniversityOption {
  value: string;
  label: string;
  sub?: string;
  keywords?: string;
}

/**
 * The catalogue as picker rows, led by the empty one — every school field in
 * the CRM is optional, and "not chosen yet" has to be selectable, not just the
 * initial state.
 */
export function toUniversityOptions<T extends NamedUniversity & { id: string }>(
  universities: T[],
  emptyLabel: string = NO_UNIVERSITY_LABEL,
): UniversityOption[] {
  return [
    { value: '', label: emptyLabel },
    ...universities.map((university) => ({
      value: university.id,
      label: universityName(university),
      sub: universitySubName(university) ?? undefined,
      // Never displayed, but staff who know a school by its Korean name should
      // be able to type it.
      keywords: university.nameKo ?? undefined,
    })),
  ];
}
