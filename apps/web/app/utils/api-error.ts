/**
 * Pulls the message out of a failed `$fetch`. Nest's ValidationPipe answers
 * with `message` as an array of field errors, everything else with a string.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: { message?: string | string[] } }).data;
  if (Array.isArray(data?.message)) return data.message.join(', ');
  return data?.message ?? fallback;
}
