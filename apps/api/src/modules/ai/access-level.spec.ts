import { describe, expect, it } from 'vitest';
import { AccessLevel, Role } from '../../prisma/client.js';
import { accessLevelFor, allowedLevels, atLeast } from './access-level.js';

/**
 * 2A-01 — the access ladder is the whole of the leak protection on the
 * retrieval side (AI-ASSISTANT.md §4.5), so it is tested as a truth table
 * rather than through a request. The levels are a total order, and a caller
 * sees their own level *and below* — the off-by-one that would hand a visitor
 * INTERNAL text is a single wrong index in `allowedLevels`.
 */
describe('access level', () => {
  it('gives an anonymous visitor PUBLIC', () => {
    expect(accessLevelFor({ role: null, hasActiveContract: false })).toBe(AccessLevel.PUBLIC);
  });

  it('gives a signed-in client without a contract REGISTERED', () => {
    expect(accessLevelFor({ role: Role.USER, hasActiveContract: false })).toBe(AccessLevel.REGISTERED);
  });

  it('gives a client holding a contract CONTRACTED', () => {
    expect(accessLevelFor({ role: Role.USER, hasActiveContract: true })).toBe(AccessLevel.CONTRACTED);
  });

  it.each([Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER])('gives %s INTERNAL', (role) => {
    expect(accessLevelFor({ role, hasActiveContract: false })).toBe(AccessLevel.INTERNAL);
  });

  it('never lets a contract raise staff or lower them', () => {
    expect(accessLevelFor({ role: Role.CONSULTANT, hasActiveContract: true })).toBe(AccessLevel.INTERNAL);
  });

  describe('allowedLevels', () => {
    it('is the caller level and everything below it', () => {
      expect(allowedLevels(AccessLevel.PUBLIC)).toEqual([AccessLevel.PUBLIC]);
      expect(allowedLevels(AccessLevel.REGISTERED)).toEqual([AccessLevel.PUBLIC, AccessLevel.REGISTERED]);
      expect(allowedLevels(AccessLevel.CONTRACTED)).toEqual([
        AccessLevel.PUBLIC,
        AccessLevel.REGISTERED,
        AccessLevel.CONTRACTED,
      ]);
      expect(allowedLevels(AccessLevel.INTERNAL)).toHaveLength(4);
    });

    it('never includes a level above the caller', () => {
      for (const level of [AccessLevel.PUBLIC, AccessLevel.REGISTERED, AccessLevel.CONTRACTED]) {
        expect(allowedLevels(level)).not.toContain(AccessLevel.INTERNAL);
      }

      expect(allowedLevels(AccessLevel.PUBLIC)).not.toContain(AccessLevel.CONTRACTED);
      expect(allowedLevels(AccessLevel.REGISTERED)).not.toContain(AccessLevel.CONTRACTED);
    });
  });

  describe('atLeast', () => {
    it('gates a tool by floor, not by equality', () => {
      expect(atLeast(AccessLevel.CONTRACTED, AccessLevel.REGISTERED)).toBe(true);
      expect(atLeast(AccessLevel.REGISTERED, AccessLevel.REGISTERED)).toBe(true);
      expect(atLeast(AccessLevel.PUBLIC, AccessLevel.REGISTERED)).toBe(false);
    });
  });
});
