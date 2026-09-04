import { ADULT_AGE, ageOn } from '../clients/dto/client-fields.js';

/** A field the brokerage contract prints, and the client has not filled in yet. */
export interface MissingField {
  field: string;
  label: string;
}

export interface ProfileCompleteness {
  exists: boolean;
  isComplete: boolean;
  isMinor: boolean;
  missing: MissingField[];
}

type ProfileLike = {
  lastName: string | null;
  firstName: string | null;
  birthDate: Date | string | null;
  registerNumber: string | null;
  phone: string | null;
  address: string | null;
  guardianLastName: string | null;
  guardianFirstName: string | null;
  guardianRegisterNumber: string | null;
};

const BASE_FIELDS: MissingField[] = [
  { field: 'lastName', label: 'Овог' },
  { field: 'firstName', label: 'Нэр' },
  { field: 'birthDate', label: 'Төрсөн огноо' },
  { field: 'registerNumber', label: 'Регистрийн дугаар' },
  { field: 'phone', label: 'Утасны дугаар' },
  { field: 'address', label: 'Гэрийн хаяг' },
];

const GUARDIAN_FIELDS: MissingField[] = [
  { field: 'guardianLastName', label: 'Төлөөлөгчийн овог' },
  { field: 'guardianFirstName', label: 'Төлөөлөгчийн нэр' },
  { field: 'guardianRegisterNumber', label: 'Төлөөлөгчийн регистрийн дугаар' },
];

/**
 * Whether the client record carries everything the contract template prints
 * (§6.2). A minor signs through a guardian, so that block joins the list.
 */
export function profileCompleteness(client: ProfileLike | null): ProfileCompleteness {
  if (!client) {
    return { exists: false, isComplete: false, isMinor: false, missing: [...BASE_FIELDS] };
  }

  const isMinor = client.birthDate ? ageOn(new Date(client.birthDate)) < ADULT_AGE : false;
  const required = isMinor ? [...BASE_FIELDS, ...GUARDIAN_FIELDS] : BASE_FIELDS;
  const values = client as unknown as Record<string, unknown>;
  const missing = required.filter((entry) => {
    const value = values[entry.field];
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  });

  return { exists: true, isComplete: missing.length === 0, isMinor, missing };
}
