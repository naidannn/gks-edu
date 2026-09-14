import { describe, expect, it } from 'vitest';
import { createSseParser, parseSseFrame } from '../app/utils/sse';

/**
 * The framing both streams depend on (2C-01).
 *
 * The case worth testing is the one that cannot be reproduced by hand against a
 * real server: a frame split across two network chunks. Every other bug here is
 * visible immediately; that one shows up as an answer that silently loses a
 * word every few hundred tokens.
 */
describe('parseSseFrame', () => {
  it('reads the event name and the data', () => {
    expect(parseSseFrame('event: token\ndata: {"text":"сайн"}')).toEqual({
      event: 'token',
      data: '{"text":"сайн"}',
    });
  });

  it('treats a frame with no event line as unnamed — the messenger sends those', () => {
    expect(parseSseFrame('data: {"type":"ping"}')).toEqual({ event: null, data: '{"type":"ping"}' });
  });

  it('joins multiple data lines with newlines', () => {
    expect(parseSseFrame('data: first\ndata: second')?.data).toBe('first\nsecond');
  });

  it('strips exactly one space after the colon, not the rest', () => {
    expect(parseSseFrame('data:  indented')?.data).toBe(' indented');
  });

  it('ignores comment lines — that is what the heartbeat is', () => {
    expect(parseSseFrame(': ping')).toBeNull();
  });

  it('returns null for a frame carrying no data at all', () => {
    expect(parseSseFrame('event: token')).toBeNull();
  });
});

describe('createSseParser', () => {
  it('yields whole frames and holds the partial tail', () => {
    const parser = createSseParser();

    expect(parser.push('event: token\ndata: {"text":"a"}\n\nevent: to')).toEqual([
      { event: 'token', data: '{"text":"a"}' },
    ]);
    // The second frame was cut mid-word by the chunk boundary.
    expect(parser.push('ken\ndata: {"text":"b"}\n\n')).toEqual([
      { event: 'token', data: '{"text":"b"}' },
    ]);
  });

  it('survives a split inside the blank-line separator itself', () => {
    const parser = createSseParser();

    expect(parser.push('data: one\n')).toEqual([]);
    expect(parser.push('\ndata: two\n\n')).toEqual([
      { event: null, data: 'one' },
      { event: null, data: 'two' },
    ]);
  });

  it('accepts CRLF separators', () => {
    const parser = createSseParser();

    expect(parser.push('data: one\r\n\r\ndata: two\r\n\r\n')).toEqual([
      { event: null, data: 'one' },
      { event: null, data: 'two' },
    ]);
  });

  it('returns several frames from one chunk, in order', () => {
    const parser = createSseParser();

    expect(parser.push('data: 1\n\ndata: 2\n\ndata: 3\n\n').map((frame) => frame.data)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('flushes a last frame the server did not terminate', () => {
    const parser = createSseParser();

    expect(parser.push('event: done\ndata: {"messageId":"m1"}')).toEqual([]);
    expect(parser.flush()).toEqual({ event: 'done', data: '{"messageId":"m1"}' });
    expect(parser.flush()).toBeNull();
  });

  it('does not re-emit a frame already delivered', () => {
    const parser = createSseParser();

    parser.push('data: one\n\n');
    expect(parser.flush()).toBeNull();
  });
});
