import { describe, expect, it } from 'vitest';
import {
  emptyLeadForm,
  normalizedPhone,
  leadPayload,
  leadUpdatePayload,
  validateLeadForm,
  type LeadForm,
} from '../app/utils/lead-form';

/** The office's walk-in registration form (1B-19). */
function filledForm(overrides: Partial<LeadForm> = {}): LeadForm {
  return {
    ...emptyLeadForm(),
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    phone: '99112233',
    ...overrides,
  };
}

describe('emptyLeadForm', () => {
  it('assumes an office visit that has already been advised', () => {
    const form = emptyLeadForm();
    expect(form.source).toBe('OFFICE');
    expect(form.stage).toBe('CONSULTED');
  });
});

describe('validateLeadForm', () => {
  it('needs only a name and a phone — the rest is filled in as it is learnt', () => {
    const errors: Record<string, string> = {};
    expect(validateLeadForm(filledForm(), errors)).toBe(true);
    expect(errors).toEqual({});
  });

  it('accepts a +976-prefixed number typed with separators', () => {
    const errors: Record<string, string> = {};
    expect(validateLeadForm(filledForm({ phone: '+976 9911 2233' }), errors)).toBe(true);
  });

  it('rejects a short phone number', () => {
    const errors: Record<string, string> = {};
    expect(validateLeadForm(filledForm({ phone: '9911' }), errors)).toBe(false);
    expect(errors.phone).toBeTruthy();
  });

  it('bounds age, GPA and win probability', () => {
    const errors: Record<string, string> = {};
    validateLeadForm(filledForm({ age: '9', gpa: '120', winProbability: '150' }), errors);
    expect(errors.age).toBeTruthy();
    expect(errors.gpa).toBeTruthy();
    expect(errors.winProbability).toBeTruthy();
  });

  it('clears errors from an earlier attempt', () => {
    const errors: Record<string, string> = { phone: 'хуучин алдаа' };
    expect(validateLeadForm(filledForm(), errors)).toBe(true);
    expect(errors.phone).toBeUndefined();
  });
});

describe('normalizedPhone', () => {
  it('drops the country code so a search matches what the API stored', () => {
    expect(normalizedPhone('+976 9911-2233')).toBe('99112233');
    expect(normalizedPhone('99112233')).toBe('99112233');
  });
});

describe('leadPayload', () => {
  it('leaves untouched optional fields out rather than sending empty strings', () => {
    const payload = leadPayload(filledForm());
    expect(payload.email).toBeUndefined();
    expect(payload.schoolName).toBeUndefined();
    expect(payload.gpa).toBeUndefined();
    expect(payload.phone).toBe('99112233');
  });

  it('strips phone formatting and turns numbers into numbers', () => {
    // The country code survives — the API is the one that normalises it away,
    // so duplicate detection has a single authority rather than two.
    const payload = leadPayload(filledForm({ phone: '+976 9911-2233', age: '19', gpa: '3.4' }));
    expect(payload.phone).toBe('97699112233');
    expect(payload.age).toBe(19);
    expect(payload.gpa).toBe(3.4);
  });

  it('sends the follow-up date as a timestamp', () => {
    const payload = leadPayload(filledForm({ nextContactAt: '2026-09-20' }));
    expect(String(payload.nextContactAt)).toMatch(/^2026-09-20T/);
  });
});

describe('leadUpdatePayload', () => {
  it('withholds the fields that have their own endpoint, so edits cannot skip the funnel', () => {
    const payload = leadUpdatePayload(filledForm({ assignedToId: 'staff-1' }));
    expect(payload.stage).toBeUndefined();
    expect(payload.source).toBeUndefined();
    expect(payload.assignedToId).toBeUndefined();
    expect(payload.lastName).toBe('Батбаяр');
  });
});
