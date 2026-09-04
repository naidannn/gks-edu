import { describe, expect, it } from 'vitest';
import {
  emptyClientForm,
  myProfilePayload,
  validateMyProfileForm,
  type ClientForm,
} from '../app/utils/client-form';

/** The portal's own profile form (1B-18) — same rules as the office form, plus the address. */
function filledForm(overrides: Partial<ClientForm> = {}): ClientForm {
  return {
    ...emptyClientForm(),
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    birthDate: '2004-03-12',
    registerNumber: 'УБ12345678',
    phone: '99112233',
    address: 'УБ, СБД, 1-р хороо',
    primaryServiceType: 'BACHELOR',
    ...overrides,
  };
}

describe('validateMyProfileForm', () => {
  it('accepts a complete adult form', () => {
    const errors: Record<string, string> = {};
    expect(validateMyProfileForm(filledForm(), errors)).toBe(true);
    expect(errors).toEqual({});
  });

  it('requires the address the contract prints', () => {
    const errors: Record<string, string> = {};
    expect(validateMyProfileForm(filledForm({ address: '  ' }), errors)).toBe(false);
    expect(errors.address).toBeDefined();
  });

  it('still requires the guardian block below 18', () => {
    const birthDate = new Date();
    birthDate.setFullYear(birthDate.getFullYear() - 16);

    const errors: Record<string, string> = {};
    const valid = validateMyProfileForm(filledForm({ birthDate: birthDate.toISOString().slice(0, 10) }), errors);
    expect(valid).toBe(false);
    expect(errors.guardianRegisterNumber).toBeDefined();
  });
});

describe('myProfilePayload', () => {
  it('drops the fields only the office owns — the API rejects unknown keys', () => {
    const payload = myProfilePayload(filledForm({ note: 'дотоод тэмдэглэл', source: 'OFFICE' }));
    expect(payload).not.toHaveProperty('source');
    expect(payload).not.toHaveProperty('note');
    expect(payload).toMatchObject({ registerNumber: 'УБ12345678', primaryServiceType: 'BACHELOR' });
  });

  it('leaves an adult with no guardian block at all', () => {
    const payload = myProfilePayload(filledForm({ guardianLastName: 'Хуучин' }));
    expect(payload.guardianLastName).toBeUndefined();
  });
});
