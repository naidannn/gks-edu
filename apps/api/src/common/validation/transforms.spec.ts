import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateClientDto } from '../../modules/clients/dto/create-client.dto.js';
import { CreateLeadDto } from '../../modules/leads/dto/create-lead.dto.js';
import { CreatePublicLeadDto } from '../../modules/leads/dto/create-public-lead.dto.js';
import { RegisterDto } from '../../modules/auth/dto/register.dto.js';
import { LoginDto } from '../../modules/auth/dto/login.dto.js';
import { ForgotPasswordDto } from '../../modules/auth/dto/password-reset.dto.js';
import { CreateStaffDto } from '../../modules/users/dto/staff.dto.js';
import { UpdateUserDto } from '../../modules/users/dto/update-user.dto.js';
import { mongolianValidationMessages } from './validation-messages.js';
import { UUID_OR_UNASSIGNED } from './transforms.js';

/**
 * 1N-41 — the address was normalised on some paths and not others. Registration
 * and login stored and looked up exactly what was typed, while the reset, the
 * staff register, the client-account adoption and Google sign-in all lowercased
 * or matched case-insensitively. A client who registered as `Bat@Gmail.com`
 * therefore got a second account when staff registered them, and could not log
 * in with the lowercase form.
 *
 * One transform, on every DTO that carries an address.
 */
const MESSY = '  Bat@Gmail.COM ';

describe('email normalisation across every entry point (1N-41)', () => {
  it.each<[string, ClassConstructor<object>]>([
    ['RegisterDto', RegisterDto],
    ['LoginDto', LoginDto],
    ['ForgotPasswordDto', ForgotPasswordDto],
    ['CreateStaffDto', CreateStaffDto],
    ['UpdateUserDto', UpdateUserDto],
    ['CreateLeadDto', CreateLeadDto],
    ['CreatePublicLeadDto', CreatePublicLeadDto],
    ['CreateClientDto', CreateClientDto],
  ])('%s trims and lowercases', (_name, Dto) => {
    const instance = plainToInstance(Dto, { email: MESSY }) as { email?: string };
    expect(instance.email).toBe('bat@gmail.com');
  });

  it('leaves a non-string alone for @IsEmail to reject', () => {
    const instance = plainToInstance(LoginDto, { email: 42 }) as { email?: unknown };
    expect(instance.email).toBe(42);
  });
});

describe('phone normalisation (1N-52)', () => {
  it.each<[string, ClassConstructor<object>]>([
    ['CreateLeadDto', CreateLeadDto],
    ['CreatePublicLeadDto', CreatePublicLeadDto],
    ['CreateClientDto', CreateClientDto],
  ])('%s compares digits, not formatting', (_name, Dto) => {
    const instance = plainToInstance(Dto, { phone: '+976 9911-2233' }) as { phone?: string };
    expect(instance.phone).toBe('97699112233');
  });

  it('words a bad number in Mongolian, from the validation-message layer', async () => {
    const dto = plainToInstance(CreatePublicLeadDto, {
      lastName: 'Батбаяр',
      firstName: 'Тэмүүлэн',
      phone: '12',
    });

    const messages = mongolianValidationMessages(await validate(dto));
    expect(messages).toContain('Утасны дугаар буруу байна');
  });
});

describe('UUID_OR_UNASSIGNED', () => {
  it('accepts an id or the word the CRM lists use for nobody', () => {
    expect(UUID_OR_UNASSIGNED.test('unassigned')).toBe(true);
    expect(UUID_OR_UNASSIGNED.test('11111111-1111-1111-1111-111111111111')).toBe(true);
  });

  it('rejects anything else, so it never reaches a uuid column as a 500', () => {
    expect(UUID_OR_UNASSIGNED.test('me')).toBe(false);
    expect(UUID_OR_UNASSIGNED.test('')).toBe(false);
  });
});
