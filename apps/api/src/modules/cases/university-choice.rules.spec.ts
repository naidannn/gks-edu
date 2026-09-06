import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CaseChoiceTrack, ServiceType } from '../../prisma/client.js';
import { choiceLimits, normaliseChoices } from './university-choice.rules.js';

const SNU = '11111111-1111-1111-1111-111111111111';
const KOREA = '22222222-2222-2222-2222-222222222222';
const HANYANG = '33333333-3333-3333-3333-333333333333';
const YONSEI = '44444444-4444-4444-4444-444444444444';

describe('choiceLimits', () => {
  it('gives a GKS case two scholarship schools plus one ordinary one', () => {
    expect(choiceLimits(ServiceType.GKS_SCHOLARSHIP)).toEqual({ scholarship: 2, regular: 1 });
  });

  it('gives ordinary brokerage three schools and no scholarship track', () => {
    expect(choiceLimits(ServiceType.BACHELOR)).toEqual({ scholarship: 0, regular: 3 });
  });
});

describe('normaliseChoices', () => {
  it('defaults the track from the service and numbers the choices', () => {
    const choices = normaliseChoices(ServiceType.BACHELOR, [{ universityId: SNU }, { universityId: KOREA }]);

    expect(choices).toEqual([
      { universityId: SNU, programId: null, track: CaseChoiceTrack.REGULAR, sortOrder: 0, major: null, note: null },
      { universityId: KOREA, programId: null, track: CaseChoiceTrack.REGULAR, sortOrder: 1, major: null, note: null },
    ]);
  });

  it('puts the scholarship schools ahead of the free ordinary one', () => {
    const choices = normaliseChoices(ServiceType.GKS_SCHOLARSHIP, [
      { universityId: HANYANG, track: CaseChoiceTrack.REGULAR },
      { universityId: SNU },
      { universityId: KOREA },
    ]);

    expect(choices.map((choice) => [choice.universityId, choice.track, choice.sortOrder])).toEqual([
      [SNU, CaseChoiceTrack.SCHOLARSHIP, 0],
      [KOREA, CaseChoiceTrack.SCHOLARSHIP, 1],
      [HANYANG, CaseChoiceTrack.REGULAR, 2],
    ]);
  });

  it('accepts an empty list — a case may be opened before a school is picked', () => {
    expect(normaliseChoices(ServiceType.MASTER, [])).toEqual([]);
  });

  it('refuses a third scholarship school', () => {
    expect(() =>
      normaliseChoices(ServiceType.GKS_SCHOLARSHIP, [
        { universityId: SNU },
        { universityId: KOREA },
        { universityId: HANYANG },
      ]),
    ).toThrow(BadRequestException);
  });

  it('refuses a second extra ordinary school on a GKS case', () => {
    expect(() =>
      normaliseChoices(ServiceType.GKS_SCHOLARSHIP, [
        { universityId: SNU },
        { universityId: KOREA, track: CaseChoiceTrack.REGULAR },
        { universityId: HANYANG, track: CaseChoiceTrack.REGULAR },
      ]),
    ).toThrow(BadRequestException);
  });

  it('refuses a fourth school on ordinary brokerage', () => {
    expect(() =>
      normaliseChoices(ServiceType.LANGUAGE_PREP, [
        { universityId: SNU },
        { universityId: KOREA },
        { universityId: HANYANG },
        { universityId: YONSEI },
      ]),
    ).toThrow(BadRequestException);
  });

  it('refuses a scholarship choice outside the scholarship service', () => {
    expect(() =>
      normaliseChoices(ServiceType.BACHELOR, [{ universityId: SNU, track: CaseChoiceTrack.SCHOLARSHIP }]),
    ).toThrow(BadRequestException);
  });

  it('refuses the same school twice', () => {
    expect(() => normaliseChoices(ServiceType.PHD, [{ universityId: SNU }, { universityId: SNU }])).toThrow(
      BadRequestException,
    );
  });
});
