import { describe, expect, it } from 'vitest';
import { profileCompleteness } from './profile-completeness.js';

describe('profileCompleteness', () => {
  const adult = {
    lastName: 'Батбаяр',
    firstName: 'Түвшин',
    birthDate: new Date('1999-05-04'),
    registerNumber: 'УБ12345678',
    phone: '99112233',
    address: 'УБ, СБД',
    guardianLastName: null,
    guardianFirstName: null,
    guardianRegisterNumber: null,
  };

  it('reports every contract field as missing when there is no client record yet', () => {
    const result = profileCompleteness(null);
    expect(result.exists).toBe(false);
    expect(result.missing.map((field) => field.field)).toContain('registerNumber');
  });

  it('accepts a complete adult record', () => {
    expect(profileCompleteness(adult)).toMatchObject({ exists: true, isComplete: true, isMinor: false });
  });

  it('treats a blank address as missing — the contract prints it', () => {
    const result = profileCompleteness({ ...adult, address: '   ' });
    expect(result.isComplete).toBe(false);
    expect(result.missing).toEqual([{ field: 'address', label: 'Гэрийн хаяг' }]);
  });

  it('requires the guardian block below 18 (§6.2)', () => {
    const minorBirth = new Date();
    minorBirth.setFullYear(minorBirth.getFullYear() - 16);

    const result = profileCompleteness({ ...adult, birthDate: minorBirth });
    expect(result.isMinor).toBe(true);
    expect(result.missing.map((field) => field.field)).toEqual([
      'guardianLastName',
      'guardianFirstName',
      'guardianRegisterNumber',
    ]);
  });
});
