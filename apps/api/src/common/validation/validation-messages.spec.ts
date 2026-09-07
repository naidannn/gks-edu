import { ValidationPipe } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { VALIDATION_PIPE_OPTIONS } from './validation-pipe.options.js';

class ChoiceDto {
  @IsUUID()
  universityId!: string;
}

class SampleDto {
  @IsString()
  @MaxLength(8)
  phone!: string;

  @Matches(/^УБ\d{8}$/, { message: 'Регистрийн дугаар буруу байна' })
  registerNumber!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2024)
  year!: number;

  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  universityChoices!: ChoiceDto[];
}

const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);

async function messagesFor(body: unknown): Promise<string[]> {
  try {
    await pipe.transform(body, { type: 'body', metatype: SampleDto as never });
  } catch (error) {
    return (error as { response: { message: string[] } }).response.message;
  }
  throw new Error('expected the pipe to reject');
}

const VALID = {
  phone: '99112233',
  registerNumber: 'УБ12345678',
  year: 2026,
  universityChoices: [{ universityId: '11111111-1111-4111-8111-111111111111' }],
};

describe('ValidationPipe replies in Mongolian', () => {
  it('translates the defaults class-validator writes in English', async () => {
    const messages = await messagesFor({ ...VALID, phone: '9911223344' });
    expect(messages).toContain('Утасны дугаар: хамгийн ихдээ 8 тэмдэгт байх ёстой');
  });

  it("keeps the number the decorator was given, not the value's own digits", async () => {
    const messages = await messagesFor({ ...VALID, year: 1999 });
    expect(messages).toContain('Он: хамгийн багадаа 2024 байх ёстой');
  });

  it('leaves a DTO that worded its own message alone', async () => {
    const messages = await messagesFor({ ...VALID, registerNumber: 'AB1' });
    expect(messages).toEqual(['Регистрийн дугаар буруу байна']);
  });

  it('names the position and the field inside a nested array', async () => {
    const messages = await messagesFor({
      ...VALID,
      universityChoices: [{ universityId: 'nope' }],
    });
    expect(messages).toEqual([
      'Сонгосон сургуулиуд › 1 › Сургууль: дугаар буруу форматтай байна',
    ]);
  });

  it('answers in Mongolian for a field no DTO declares', async () => {
    const messages = await messagesFor({ ...VALID, madeUp: 1 });
    expect(messages).toEqual(['madeUp: ийм талбар байхгүй']);
  });
});
