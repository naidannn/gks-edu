import { describe, expect, it } from 'vitest';
import { IntakeStatus, ProgramLevel, ServiceType } from '../../prisma/client.js';
import {
  computeInternalDeadline,
  computeIntakePhase,
  daysUntil,
  isIntakeSelectable,
  resolveInternalDeadline,
  resolveIntakeDates,
  serviceAcceptsLevel,
  type IntakeDateFields,
} from './intake-deadline.js';

const iso = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** A March 2027 language-prep round: school closes 31 Jan, we close 24 Jan. */
function term(overrides: Partial<IntakeDateFields> = {}): IntakeDateFields {
  return {
    openAt: iso('2026-11-01'),
    applicationDeadline: iso('2027-01-31'),
    internalDeadline: iso('2027-01-24'),
    internalDeadlineIsManual: false,
    classStartDate: iso('2027-03-02'),
    ...overrides,
  };
}

describe('computeInternalDeadline', () => {
  it('lands the configured number of days before the school deadline', () => {
    expect(computeInternalDeadline(iso('2027-01-31'), 7)).toEqual(iso('2027-01-24'));
  });

  it('follows the config rather than a hard-coded 7', () => {
    expect(computeInternalDeadline(iso('2027-01-31'), 14)).toEqual(iso('2027-01-17'));
  });

  it('has nothing to compute without a school deadline', () => {
    expect(computeInternalDeadline(null, 7)).toBeNull();
  });
});

describe('resolveInternalDeadline', () => {
  it('recomputes while the date is automatic', () => {
    const resolved = resolveInternalDeadline({
      applicationDeadline: iso('2027-01-31'),
      internalDeadline: iso('2027-01-24'),
      internalDeadlineIsManual: false,
      leadDays: 21,
    });

    expect(resolved).toEqual(iso('2027-01-10'));
  });

  // The expensive bug this module exists to avoid: a config change quietly
  // erasing the date a consultant negotiated with the school.
  it('never overwrites a date a human typed', () => {
    const resolved = resolveInternalDeadline({
      applicationDeadline: iso('2027-01-31'),
      internalDeadline: iso('2026-12-15'),
      internalDeadlineIsManual: true,
      leadDays: 7,
    });

    expect(resolved).toEqual(iso('2026-12-15'));
  });
});

describe('resolveIntakeDates', () => {
  it('returns the term untouched when no programme overrides it', () => {
    expect(resolveIntakeDates(term())).toEqual(term());
  });

  it('lets an override win field by field, falling through for the rest', () => {
    const merged = resolveIntakeDates(term(), {
      applicationDeadline: iso('2027-01-15'),
      internalDeadline: iso('2027-01-08'),
      internalDeadlineIsManual: false,
    });

    expect(merged.applicationDeadline).toEqual(iso('2027-01-15'));
    expect(merged.internalDeadline).toEqual(iso('2027-01-08'));
    // Untouched by the override.
    expect(merged.classStartDate).toEqual(iso('2027-03-02'));
    expect(merged.openAt).toEqual(iso('2026-11-01'));
  });

  it('keeps the term manual flag when the override supplies no internal deadline', () => {
    const merged = resolveIntakeDates(term({ internalDeadlineIsManual: true }), {
      applicationDeadline: iso('2027-01-15'),
    });

    expect(merged.internalDeadlineIsManual).toBe(true);
    expect(merged.internalDeadline).toEqual(iso('2027-01-24'));
  });
});

describe('computeIntakePhase', () => {
  const dates = term();

  // GKS registers a client any time before its own deadline, so a round the
  // school has not opened yet is still open for us — there is no waiting state.
  it('is OPEN before the school opens its own window', () => {
    expect(computeIntakePhase(dates, IntakeStatus.OPEN, iso('2026-10-01'))).toBe('OPEN');
  });

  it('is OPEN up to our own deadline', () => {
    expect(computeIntakePhase(dates, IntakeStatus.OPEN, iso('2026-12-20'))).toBe('OPEN');
  });

  it('is FINAL_CALL once our deadline passes but the school still accepts', () => {
    expect(computeIntakePhase(dates, IntakeStatus.OPEN, iso('2027-01-28'))).toBe('FINAL_CALL');
  });

  it('is CLOSED after the school deadline', () => {
    expect(computeIntakePhase(dates, IntakeStatus.OPEN, iso('2027-02-05'))).toBe('CLOSED');
  });

  it('treats a draft and a cancelled round as closed regardless of dates', () => {
    expect(computeIntakePhase(dates, IntakeStatus.PLANNED, iso('2026-12-20'))).toBe('CLOSED');
    expect(computeIntakePhase(dates, IntakeStatus.CANCELLED, iso('2026-12-20'))).toBe('CLOSED');
  });

  it('stays OPEN when the school has published no dates yet', () => {
    const undated = term({ openAt: null, applicationDeadline: null, internalDeadline: null });
    expect(computeIntakePhase(undated, IntakeStatus.OPEN, iso('2026-12-20'))).toBe('OPEN');
  });

  it('ignores openAt entirely — it is the school\'s calendar, not ours', () => {
    const late = term({ openAt: iso('2027-01-20') });
    expect(computeIntakePhase(late, IntakeStatus.OPEN, iso('2026-10-01'))).toBe('OPEN');
  });
});

describe('daysUntil', () => {
  it('counts whole days ahead', () => {
    expect(daysUntil(iso('2027-01-24'), iso('2027-01-17'))).toBe(7);
  });

  it('goes negative once the date has passed', () => {
    expect(daysUntil(iso('2027-01-24'), iso('2027-01-31'))).toBe(-7);
  });

  it('has no answer without a date', () => {
    expect(daysUntil(null, iso('2027-01-17'))).toBeNull();
  });
});

describe('isIntakeSelectable', () => {
  it('still allows a final-call round — that call belongs to the consultant', () => {
    expect(isIntakeSelectable(term(), IntakeStatus.OPEN, iso('2027-01-28'))).toBe(true);
  });

  it('refuses a round the school has closed', () => {
    expect(isIntakeSelectable(term(), IntakeStatus.OPEN, iso('2027-02-05'))).toBe(false);
  });

  it('refuses a draft round', () => {
    expect(isIntakeSelectable(term(), IntakeStatus.PLANNED, iso('2026-12-20'))).toBe(false);
  });
});

describe('serviceAcceptsLevel', () => {
  it('pairs each regular service with its own level', () => {
    expect(serviceAcceptsLevel(ServiceType.BACHELOR, ProgramLevel.BACHELOR)).toBe(true);
    expect(serviceAcceptsLevel(ServiceType.BACHELOR, ProgramLevel.MASTER)).toBe(false);
  });

  // §4.3 — the scholarship covers language prep and every degree level.
  it('lets a GKS case target any level', () => {
    for (const level of Object.values(ProgramLevel)) {
      expect(serviceAcceptsLevel(ServiceType.GKS_SCHOLARSHIP, level)).toBe(true);
    }
  });
});
