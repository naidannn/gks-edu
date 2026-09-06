import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage } from '../app/utils/api-error';

const FALLBACK = 'Хадгалахад алдаа гарлаа';

describe('apiErrorMessage', () => {
  it('shows the server reason from an ApiError, which is what useApi() throws', () => {
    // The regression this test exists for: reading only `.data` meant every
    // screen fetching through useApi() showed its fallback instead.
    const error = new ApiError(409, { statusCode: 409, message: 'Энэ утас бүртгэлтэй байна' }, 'Энэ утас бүртгэлтэй байна');
    expect(apiErrorMessage(error, FALLBACK)).toBe('Энэ утас бүртгэлтэй байна');
  });

  it('reads a raw $fetch failure, which carries the parsed body on .data', () => {
    expect(apiErrorMessage({ data: { message: 'И-мэйл буруу байна' } }, FALLBACK)).toBe('И-мэйл буруу байна');
  });

  it("joins ValidationPipe's array of field errors", () => {
    const error = { data: { message: ['Утас 8 оронтой байна', 'Нэр хоосон байна'] } };
    expect(apiErrorMessage(error, FALLBACK)).toBe('Утас 8 оронтой байна, Нэр хоосон байна');
  });

  it('keeps developer text away from staff', () => {
    // A bug, or an API that never answered: `$fetch` supplies its own English
    // text with the URL in it. That is a log line, not a message for a person.
    expect(apiErrorMessage(new TypeError('Failed to fetch http://localhost:3001/leads'), FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(apiErrorMessage({ data: { message: '' } }, FALLBACK)).toBe(FALLBACK);
  });
});
