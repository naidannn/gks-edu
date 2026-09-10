/**
 * The shape checks both research parsers run on a model reply.
 *
 * `intake-candidate.parser.ts` and `program-candidate.parser.ts` ask different
 * questions of the answer, but they read it the same way: a JSON envelope of
 * unknown provenance, in which anything unexpected becomes `null` rather than a
 * default. That reading is here so the two cannot drift — the number checks
 * stay with each parser, because they are not the same check (an intake's are
 * strict integers, a programme's have to survive "4,200,000원").
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Folds a list into one envelope.
 *
 * The list is either the bare candidate list the model wrote instead of the
 * envelope — which `gemini-3.1-flash-lite` does on nearly every JSON-mode reply
 * — or, when a reply came back as more than one JSON document, those documents.
 * Both shapes can be mixed in the same list, so each entry is unwrapped on its
 * own: an envelope contributes its candidates and sources, a nested list its
 * entries, and anything else is a candidate.
 */
export function fold(entries: unknown[]): { candidates: unknown[]; sources: unknown[] } {
  const candidates: unknown[] = [];
  const sources: unknown[] = [];

  for (const entry of entries) {
    if (Array.isArray(entry)) {
      candidates.push(...entry);
    } else if (isRecord(entry) && Array.isArray(entry.candidates)) {
      candidates.push(...entry.candidates);
      if (Array.isArray(entry.sources)) sources.push(...entry.sources);
    } else {
      candidates.push(entry);
    }
  }

  return { candidates, sources };
}

/** A non-empty trimmed string, capped — or `null`, which reads as "not said". */
export function toText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

/** A citation we would actually follow: http(s), and short enough to be real. */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
