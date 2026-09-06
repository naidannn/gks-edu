import { describe, expect, it } from 'vitest';
import {
  clientPayload,
  emptyClientForm,
  filledChoices,
  myProfilePayload,
  reconcileChoices,
  validateClientForm,
  type ClientForm,
} from '../app/utils/client-form';

/**
 * Picking several schools on one contract (§3.4) — two for a GKS scholarship
 * plus the free ordinary one, or up to three for ordinary brokerage. None of it
 * moves the price, so nothing here asserts an amount.
 */

const SNU = '11111111-1111-1111-1111-111111111111';
const KOREA = '22222222-2222-2222-2222-222222222222';
const HANYANG = '33333333-3333-3333-3333-333333333333';

function filledForm(overrides: Partial<ClientForm> = {}): ClientForm {
  return {
    ...emptyClientForm(),
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    birthDate: '2004-03-12',
    registerNumber: 'УБ12345678',
    phone: '99112233',
    primaryServiceType: 'BACHELOR',
    ...overrides,
  };
}

describe('clientPayload', () => {
  it('sends the whole list and keeps the first preference as the client`s school', () => {
    const payload = clientPayload(
      filledForm({
        universityChoices: [
          { universityId: SNU, track: 'REGULAR' },
          { universityId: KOREA, track: 'REGULAR' },
        ],
      }),
    );

    expect(payload.targetUniversityId).toBe(SNU);
    expect(payload.universityChoices).toEqual([
      { universityId: SNU, track: 'REGULAR' },
      { universityId: KOREA, track: 'REGULAR' },
    ]);
  });

  it('leaves both out when no school has been picked yet', () => {
    const payload = clientPayload(filledForm());
    expect(payload.targetUniversityId).toBeUndefined();
    expect(payload.universityChoices).toBeUndefined();
  });

  it('drops the list for the portal — `PUT /me/profile` does not accept it', () => {
    const payload = myProfilePayload(filledForm({ universityChoices: [{ universityId: SNU, track: 'REGULAR' }] }));
    expect(payload.universityChoices).toBeUndefined();
    expect(payload.targetUniversityId).toBe(SNU);
  });
});

describe('filledChoices', () => {
  it('ignores the blank row the form always shows', () => {
    const form = filledForm({
      universityChoices: [
        { universityId: SNU, track: 'REGULAR' },
        { universityId: '', track: 'REGULAR' },
      ],
    });
    expect(filledChoices(form)).toEqual([{ universityId: SNU, track: 'REGULAR' }]);
  });
});

describe('validateClientForm', () => {
  it('refuses the same school twice', () => {
    const errors: Record<string, string> = {};
    const form = filledForm({
      universityChoices: [
        { universityId: SNU, track: 'REGULAR' },
        { universityId: SNU, track: 'REGULAR' },
      ],
    });

    expect(validateClientForm(form, errors)).toBe(false);
    expect(errors.universityChoices).toBeTruthy();
  });
});

describe('reconcileChoices', () => {
  it('turns scholarship rows into ordinary ones when the service stops being GKS', () => {
    const form = filledForm({
      primaryServiceType: 'MASTER',
      universityChoices: [
        { universityId: SNU, track: 'SCHOLARSHIP' },
        { universityId: KOREA, track: 'SCHOLARSHIP' },
        { universityId: HANYANG, track: 'REGULAR' },
      ],
    });

    reconcileChoices(form);

    expect(form.universityChoices.every((choice) => choice.track === 'REGULAR')).toBe(true);
    expect(form.universityChoices).toHaveLength(3);
  });

  it('re-tracks the schools already picked when the service becomes GKS', () => {
    const form = filledForm({
      primaryServiceType: 'GKS_SCHOLARSHIP',
      universityChoices: [
        { universityId: SNU, track: 'REGULAR' },
        { universityId: KOREA, track: 'REGULAR' },
        { universityId: HANYANG, track: 'REGULAR' },
      ],
    });

    reconcileChoices(form);

    expect(form.universityChoices).toEqual([
      { universityId: SNU, track: 'SCHOLARSHIP' },
      { universityId: KOREA, track: 'SCHOLARSHIP' },
      { universityId: HANYANG, track: 'REGULAR' },
    ]);
  });

  it('drops the school a GKS contract has no room for', () => {
    const form = filledForm({
      primaryServiceType: 'GKS_SCHOLARSHIP',
      universityChoices: [
        { universityId: SNU, track: 'SCHOLARSHIP' },
        { universityId: KOREA, track: 'SCHOLARSHIP' },
        { universityId: HANYANG, track: 'REGULAR' },
        { universityId: '44444444-4444-4444-4444-444444444444', track: 'REGULAR' },
      ],
    });

    reconcileChoices(form);

    expect(form.universityChoices.map((choice) => choice.universityId)).toEqual([SNU, KOREA, HANYANG]);
  });

  it('never leaves the form without a row to type into', () => {
    const form = filledForm({ universityChoices: [] });
    reconcileChoices(form);
    expect(form.universityChoices).toEqual([{ universityId: '', track: 'REGULAR' }]);
  });
});
