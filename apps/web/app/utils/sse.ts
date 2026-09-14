/**
 * The Server-Sent Events frame parser both streams share (2C-01).
 *
 * Neither stream in this app can use `EventSource`: it cannot carry an
 * `Authorization` header, and the AI chat additionally answers a POST, because
 * the question does not belong in a URL. Both therefore read `response.body`
 * with a stream reader — and both then need the one piece `EventSource` was
 * really providing, which is the framing.
 *
 * That framing is fiddly in exactly one way: a chunk boundary falls wherever
 * TCP decides, so a frame arrives split down the middle as often as not. The
 * parser below is a small state machine that holds the tail until the rest of
 * it turns up. It is pure — chunks in, frames out, no fetch, no timers — so it
 * can be tested for the split-chunk case that is otherwise only reproducible
 * against a real network.
 *
 * The two streams differ in one thing this has to carry: the messenger sends
 * data-only frames, while the assistant names every frame (`event: token`), so
 * the widget can switch on the kind without reading the payload first.
 */

/** One decoded frame. `event` is `null` when the server sent no `event:` line. */
export interface SseFrame {
  event: string | null;
  data: string;
}

/**
 * Splits a frame's raw text into its event name and joined data.
 *
 * Multiple `data:` lines are joined with newlines, which is what the spec says
 * and what a multi-line answer needs. A leading space after the colon is part
 * of the syntax, not of the value, so it comes off — but only one, because
 * `data:  x` means the value is ` x`.
 */
export function parseSseFrame(raw: string): SseFrame | null {
  let event: string | null = null;
  const data: string[] = [];

  for (const line of raw.split('\n')) {
    // A line starting with a colon is a comment — that is what the heartbeat
    // is, and it exists to keep the connection warm, not to be delivered.
    if (line.startsWith(':')) continue;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : stripOneLeadingSpace(line.slice(colon + 1));

    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  if (data.length === 0) return null;
  return { event, data: data.join('\n') };
}

/**
 * A stateful splitter: feed it decoded text, get back whole frames.
 *
 * Anything after the last blank line is a partial frame and stays in the
 * buffer for the next chunk. `flush` is for the end of the stream, where a
 * server that closed without a trailing blank line would otherwise have its
 * final frame swallowed.
 */
export function createSseParser() {
  let buffer = '';

  return {
    push(chunk: string): SseFrame[] {
      buffer += chunk;
      const frames: SseFrame[] = [];

      // `\r\n\r\n` is legal too; normalising the whole buffer each time would
      // be O(n²) over a long stream, so only the separator is treated loosely.
      let boundary = nextBoundary(buffer);
      while (boundary) {
        const frame = parseSseFrame(buffer.slice(0, boundary.index));
        if (frame) frames.push(frame);
        buffer = buffer.slice(boundary.index + boundary.length);
        boundary = nextBoundary(buffer);
      }

      return frames;
    },

    flush(): SseFrame | null {
      const rest = buffer;
      buffer = '';
      return rest.trim() ? parseSseFrame(rest) : null;
    },
  };
}

function nextBoundary(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');

  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function stripOneLeadingSpace(value: string): string {
  return value.startsWith(' ') ? value.slice(1) : value;
}
