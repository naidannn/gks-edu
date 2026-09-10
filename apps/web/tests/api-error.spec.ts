import { describe, expect, it } from 'vitest';
import { ApiError, apiErrorMessage, apiErrorStatus } from '../app/utils/api-error';

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

/**
 * 1N-51: the school page turned every fetch failure into a 404, so a timeout
 * told a visitor the school does not exist and told a crawler the URL is gone.
 * Only a real 404 may be mapped that way, which is what this reads.
 */
describe('apiErrorStatus', () => {
  it('reads the status off an ApiError', () => {
    expect(apiErrorStatus(new ApiError(404, undefined, 'Олдсонгүй'))).toBe(404);
  });

  it("reads useFetch's FetchError shapes", () => {
    expect(apiErrorStatus({ statusCode: 503 })).toBe(503);
    expect(apiErrorStatus({ status: 500 })).toBe(500);
    expect(apiErrorStatus({ response: { status: 404 } })).toBe(404);
  });

  it('is null when the request never got an answer', () => {
    expect(apiErrorStatus(new TypeError('Failed to fetch'))).toBeNull();
    expect(apiErrorStatus(null)).toBeNull();
    expect(apiErrorStatus(undefined)).toBeNull();
  });
});
