/**
 * Reads `data:` payloads out of a streaming HTTP body (2B-01).
 *
 * Both providers stream server-sent events, and both are read with `fetch` +
 * a reader rather than `EventSource` — the same reason the messenger does
 * (1K): `EventSource` cannot carry an Authorization header.
 *
 * The chunk boundary is the thing worth being careful about. A network chunk is
 * not an event: a single JSON payload routinely arrives split across two reads,
 * and the naive "split the chunk on newlines and parse each line" is a parser
 * that works in development and drops tokens in production. So the buffer is
 * kept across reads and only complete lines are emitted.
 */
export async function* sseDataLines(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const onAbort = () => void reader.cancel().catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);

        if (line.startsWith('data:')) {
          const payload = line.slice(5).trim();
          if (payload.length > 0) yield payload;
        }

        newline = buffer.indexOf('\n');
      }
    }

    // A stream that ends without a trailing newline still owes us its last line.
    const tail = buffer.trim();
    if (tail.startsWith('data:')) {
      const payload = tail.slice(5).trim();
      if (payload.length > 0) yield payload;
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}
