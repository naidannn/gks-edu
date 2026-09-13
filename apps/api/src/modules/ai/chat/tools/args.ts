import { ToolArgumentError } from './tool.types.js';

/**
 * Reading arguments a language model wrote.
 *
 * These are not user input and they are not API input — they are a model's best
 * guess at a JSON Schema, and the failure modes are its own: `"limit": "5"`,
 * `"gksEligible": "true"`, `"level": "bachelor"`, a whole field invented. So
 * every reader coerces what is obviously meant, clamps what is out of range,
 * and returns `undefined` for what is not usable rather than throwing — a
 * dropped optional filter still answers the question, where a thrown turn does
 * not. Only a missing *required* argument is an error, and the model is told so
 * in words it can act on.
 *
 * The shapes being read are mirrored in `packages/shared/src/schemas/ai-tools.ts`.
 */

export function readString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const raw = args[key];
  if (typeof raw !== 'string') return undefined;

  const value = raw.trim().slice(0, maxLength);
  return value.length > 0 ? value : undefined;
}

export function requireString(
  args: Record<string, unknown>,
  key: string,
  maxLength: number,
): string {
  const value = readString(args, key, maxLength);
  if (value === undefined) throw new ToolArgumentError(`"${key}" утгыг заавал өгнө үү`);

  return value;
}

/**
 * An enum value, matched case-insensitively — a model that has been told
 * `BACHELOR` will sooner or later send `Bachelor`, and refusing that is pedantry
 * rather than safety. Anything not on the list is dropped.
 */
export function readEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = args[key];
  if (typeof raw !== 'string') return undefined;

  const wanted = raw.trim().toUpperCase();
  return allowed.find((value) => value.toUpperCase() === wanted);
}

export function requireEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = readEnum(args, key, allowed);
  if (value === undefined) {
    throw new ToolArgumentError(`"${key}" нь дараахын нэг байх ёстой: ${allowed.join(', ')}`);
  }

  return value;
}

/** An integer, clamped into range. `"5"` and `5.4` both read as 5. */
export function readInt(
  args: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const raw = args[key];
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return undefined;

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

/** `true`, `"true"` and `"yes"` are true; `false` and `"false"` are false. */
export function readBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const raw = args[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return undefined;

  const value = raw.trim().toLowerCase();
  if (['true', 'yes', 'тийм', '1'].includes(value)) return true;
  if (['false', 'no', 'үгүй', '0'].includes(value)) return false;

  return undefined;
}
