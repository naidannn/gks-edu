/**
 * Collapses overlapping calls into one.
 *
 * The caller this exists for is the token refresh. The API rotates refresh
 * tokens — presenting one burns it — while a screen that loads several things
 * at once (`/admin` asks for four) discovers its expired access token in four
 * requests simultaneously. Each would ask for a refresh with the same token,
 * the first would win, and the other three would present a token that no
 * longer exists and sign the user out of a session that had just been renewed.
 *
 * Callers that arrive while a run is in flight get that run's result. The slot
 * is cleared once it settles, so the next caller starts a fresh one — this is
 * de-duplication, not a cache.
 */
export function singleFlight<T>(run: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    inFlight ??= run().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
