/**
 * The form a catalogue name is compared in: every space dropped, Latin letters
 * lower-cased. `글로벌 경영학과` and `글로벌경영학과` are one department —
 * Korean schools are not consistent about the space, and neither are research
 * runs — and `AI융합학부` is the same row whoever typed the capitals.
 *
 * Inside one school a programme (per level) and a faculty are identified by
 * their **Korean** name in this form, not by `nameMn`: the Korean name is the
 * school's own wording and does not change, while the Mongolian one is our
 * translation and comes out differently every time somebody words it. The
 * partial unique indexes of migration `20261008140000_catalogue_korean_name_unique`
 * hold the same expression — change one, change the other (ARCHITECTURE.md §3.3).
 *
 * Null for a missing or blank name, which never collides with anything.
 */
export function catalogueNameKey(name: string | null | undefined): string | null {
  const key = name?.replace(/\s+/gu, '').toLowerCase();
  return key || null;
}
