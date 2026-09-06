import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ConvertLeadDto } from '../clients/dto/convert-lead.dto.js';
import { CreateClientDto } from '../clients/dto/create-client.dto.js';
import { UpdateClientDto } from '../clients/dto/update-client.dto.js';
import { CreateCaseDto } from './dto/create-case.dto.js';
import { ReplaceUniversityChoicesDto } from './dto/replace-university-choices.dto.js';

/**
 * `universityChoices` reaches four of these five DTOs through `PartialType` /
 * `OmitType`, which rebuild a class and copy its validation metadata across. If
 * that copy ever misses the nested array, the route does not fail loudly — the
 * global pipe runs with `forbidNonWhitelisted`, so the field simply becomes
 * "property universityChoices should not exist" and every school past the first
 * is silently unsubmittable.
 *
 * So this asserts against the real pipe from `main.ts`, not against the classes.
 */

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

const SNU = '11111111-1111-4111-8111-111111111111';
const HANYANG = '33333333-3333-4333-8333-333333333333';

/** The shape the admin form posts for a GKS case: one scholarship school + the free ordinary one. */
const CHOICES = [
  { universityId: SNU, track: 'SCHOLARSHIP' },
  { universityId: HANYANG, track: 'REGULAR' },
];

const CLIENT = {
  lastName: 'Батбаяр',
  firstName: 'Түвшин',
  birthDate: '1998-04-17',
  registerNumber: 'УБ12345678',
  phone: '99112233',
  primaryServiceType: 'GKS_SCHOLARSHIP',
  universityChoices: CHOICES,
};

async function through(metatype: unknown, body: unknown) {
  return (await pipe.transform(body, { type: 'body', metatype: metatype as never })) as {
    universityChoices?: unknown[];
  };
}

describe('universityChoices survives the global pipe (§5.1)', () => {
  it('POST /clients', async () => {
    expect((await through(CreateClientDto, CLIENT)).universityChoices).toHaveLength(2);
  });

  it('POST /clients/from-lead/:leadId', async () => {
    expect((await through(ConvertLeadDto, CLIENT)).universityChoices).toHaveLength(2);
  });

  it('PATCH /clients/:id', async () => {
    expect((await through(UpdateClientDto, { universityChoices: CHOICES })).universityChoices).toHaveLength(2);
  });

  it('POST /cases', async () => {
    const body = { userId: SNU, serviceType: 'GKS_SCHOLARSHIP', universityChoices: CHOICES };
    expect((await through(CreateCaseDto, body)).universityChoices).toHaveLength(2);
  });

  it('PATCH /cases/:id/universities', async () => {
    expect((await through(ReplaceUniversityChoicesDto, { universityChoices: CHOICES })).universityChoices)
      .toHaveLength(2);
  });

  it('still rejects a field no DTO declares', async () => {
    await expect(through(ReplaceUniversityChoicesDto, { universityChoices: CHOICES, madeUp: 1 })).rejects.toThrow();
  });
});
