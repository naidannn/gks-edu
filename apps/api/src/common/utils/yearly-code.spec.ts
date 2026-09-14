import { describe, expect, it, vi } from 'vitest';

import { nextYearlyCode } from './yearly-code.js';

const year = new Date().getFullYear();

describe('nextYearlyCode', () => {
  it('starts the year at 0001', async () => {
    await expect(nextYearlyCode('KH', async () => null)).resolves.toBe(`KH-${year}-0001`);
  });

  it('continues from the highest code already issued', async () => {
    await expect(nextYearlyCode('KH', async () => `KH-${year}-0015`)).resolves.toBe(`KH-${year}-0016`);
  });

  it('asks only for this year, so January restarts the sequence', async () => {
    const highest = vi.fn(async () => null);
    await nextYearlyCode('GKS', highest);
    expect(highest).toHaveBeenCalledWith(`GKS-${year}-`);
  });

  // The bug this replaced: a count of the rows says "eleven is free" after five
  // of fifteen clients are deleted, and eleven is taken. Reading the maximum
  // leaves the gap alone and hands out sixteen.
  it('keeps handing out free numbers after rows in the middle are deleted', async () => {
    await expect(nextYearlyCode('KH', async () => `KH-${year}-0015`)).resolves.toBe(`KH-${year}-0016`);
  });

  it('pads past 9999 rather than truncating', async () => {
    await expect(nextYearlyCode('CH', async () => `CH-${year}-9999`)).resolves.toBe(`CH-${year}-10000`);
  });

  it('falls back to the start of the sequence when a stored code has no number', async () => {
    await expect(nextYearlyCode('KH', async () => `KH-${year}-`)).resolves.toBe(`KH-${year}-0001`);
  });
});
