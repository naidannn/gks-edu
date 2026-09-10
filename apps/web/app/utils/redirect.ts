/**
 * Where `?redirect=` is allowed to send somebody.
 *
 * The guards bounce an anonymous visitor to `/login?redirect=<path>` and the
 * auth pages hand that value straight to `navigateTo`. Unfiltered, that is two
 * problems at once. `navigateTo` refuses an external URL by throwing — and it
 * throws *after* the session has been stored, so a crafted link left the
 * visitor signed in, on an error page, with no way forward. And a value it did
 * not refuse would be an open redirect out of a page a person just typed their
 * password into.
 *
 * So only a path is accepted: one leading slash, and nothing a browser would
 * read as a host. `//evil.example` and a backslash-led one are both
 * protocol-relative URLs, not paths, whatever they look like.
 */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;

  const path = value.trim();
  if (!path.startsWith('/')) return fallback;
  if (path.startsWith('//') || path.startsWith('/\\')) return fallback;
  // A control character in a location is a header-splitting trick, and no
  // route of ours contains one. Tested by code point rather than by a regex
  // class, which the linter reads (fairly) as a mistake wherever it appears.
  for (const char of path) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return fallback;
  }

  return path;
}
