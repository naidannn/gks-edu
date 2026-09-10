import { Prisma } from '../../prisma/client.js';
import { describe, expect, it } from 'vitest';
import { localInstant, localMonth, within } from './report-sql.js';

/**
 * 1N-37 — the monthly breakdown bucketed on
 * `date_trunc('month', col AT TIME ZONE 'Asia/Ulaanbaatar')`. Every `DateTime`
 * column here is `timestamp without time zone` holding a UTC value, so that
 * expression told Postgres the naive value was *already* Ulaanbaatar time and
 * converted it the wrong way — pushing every payment taken in the office's
 * first sixteen hours of a month into the month before.
 *
 * Proving the arithmetic needs a live Postgres, which these tests do not have.
 * The fragment is pinned as a string instead: the double `AT TIME ZONE` is the
 * whole fix, and a single one coming back is exactly the regression.
 */
describe('localMonth (1N-37)', () => {
  const sql = localMonth(Prisma.sql`p."paidAt"`);

  it('says what the naive value is before putting it on the office clock', () => {
    expect(sql.sql.replace(/\s+/g, ' ')).toBe(
      `to_char(date_trunc('month', (p."paidAt" AT TIME ZONE 'UTC') AT TIME ZONE ?), 'YYYY-MM')`,
    );
    expect(sql.values).toEqual(['Asia/Ulaanbaatar']);
  });

  it('does not read the column as local time — the bug, in one assertion', () => {
    // A single `AT TIME ZONE` on a naive column is the wrong direction.
    expect(sql.sql).not.toMatch(/p\."paidAt" AT TIME ZONE \?/);
  });
});

/**
 * The period totals were always right, and this is why: both sides of the
 * comparison are instants, so Postgres does the conversion itself.
 */
describe('within', () => {
  it('compares the column against instants built from office-local dates', () => {
    const sql = within(Prisma.sql`p."paidAt"`, '2026-09-01', '2026-10-01');

    expect(sql.sql.replace(/\s+/g, ' ')).toContain('p."paidAt" >= (CAST(? AS date)::timestamp AT TIME ZONE ?)');
    expect(sql.values).toEqual(['2026-09-01', 'Asia/Ulaanbaatar', '2026-10-01', 'Asia/Ulaanbaatar']);
  });

  it('is half-open, so a boundary midnight is counted once', () => {
    expect(within(Prisma.sql`c."createdAt"`, '2026-09-01', '2026-10-01').sql).toContain('<');
    expect(localInstant('2026-09-01').values).toEqual(['2026-09-01', 'Asia/Ulaanbaatar']);
  });
});
