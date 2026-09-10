import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { VALIDATION_PIPE_OPTIONS } from '../../common/validation/validation-pipe.options.js';
import { EducationLevel, ServiceType } from '../../prisma/client.js';
import { QueryGksEligibilityDto } from './dto/query-gks-eligibility.dto.js';
import { GksEligibilityService } from './gks-eligibility.service.js';

/** The office's current figures, as `ServicePricing` would hand them over. */
const pricing = {
  publicPricing: async () => [
    { serviceType: ServiceType.GKS_SCHOLARSHIP, totalAmount: 5_000_000, prepaymentAmount: 1_500_000 },
    { serviceType: ServiceType.BACHELOR, totalAmount: 1_200_000, prepaymentAmount: 200_000 },
    { serviceType: ServiceType.MASTER, totalAmount: 1_200_000, prepaymentAmount: 200_000 },
  ],
};

const service = new GksEligibilityService(pricing as never);

const ask = (patch: Partial<QueryGksEligibilityDto> = {}) =>
  service.check({
    degree: 'BACHELOR',
    age: 18,
    education: EducationLevel.SECONDARY_SCHOOL,
    graduating: true,
    gpa: 88,
    gpaScale: '100',
    topik: 0,
    english: 'NONE',
    strengths: [],
    blockers: [],
    ...patch,
  } as QueryGksEligibilityDto);

describe('GksEligibilityService', () => {
  it('passes an ordinary school leaver with an 88% average', async () => {
    const result = await ask();
    expect(result.eligibility.verdict).toBe('PASS');
    expect(result.eligibility.criteria.every((row) => row.met !== false)).toBe(true);
  });

  it('reports readiness apart from eligibility, and never as a number', async () => {
    const result = await ask();
    expect(result.readiness.band).toBeTruthy();
    expect(result.readiness).not.toHaveProperty('score');
    // Every factor is a word, not a mark — nothing on this page is addable.
    for (const factor of result.readiness.factors) {
      expect(factor.levelMn).toBeTruthy();
      expect(factor).not.toHaveProperty('score');
      expect(factor).not.toHaveProperty('max');
    }
    // Passing the criteria must not read as "you will win" anywhere.
    expect(result.eligibility.summaryMn).toContain('тэтгэлэг авна гэсэн үг биш');
  });

  it('blocks a bachelor holder from the undergraduate award and points at the master s', async () => {
    const result = await ask({ degree: 'BACHELOR', education: EducationLevel.BACHELOR, graduating: false, age: 23 });
    expect(result.eligibility.verdict).toBe('BLOCKED');
    expect(result.suggestedDegree).toBe('MASTER');
  });

  it('keeps the door open in words even when a hard rule fails', async () => {
    const result = await ask({ age: 27 });
    expect(result.eligibility.verdict).toBe('BLOCKED');
    expect(result.eligibility.summaryMn).toContain('энгийн зуучлал');
  });

  it('saves a low grade when the visitor is in the top fifth of their class', async () => {
    const low = await ask({ gpa: 70 });
    expect(low.eligibility.verdict).toBe('BLOCKED');
    const rescued = await ask({ gpa: 70, strengths: ['TOP_20_PERCENT'] });
    expect(rescued.eligibility.verdict).toBe('PASS');
  });

  it('sends a borderline age to a consultant rather than deciding it', async () => {
    const result = await ask({ age: 24 });
    expect(result.eligibility.verdict).toBe('REVIEW');
  });

  it('prices the dual track from ServicePricing, never from a constant', async () => {
    const result = await ask();
    expect(result.dualTrack.scholarship.prepaymentAmount).toBe(1_500_000);
    expect(result.dualTrack.regular.serviceType).toBe(ServiceType.BACHELOR);
    expect(result.dualTrack.regular.prepaymentAmount).toBe(200_000);
    expect(result.dualTrack.noExtraFee).toBe(true);
  });

  // gksedu.md §9 — the scholarship balance falls due after the result, the
  // regular one after the visa. Getting this pair backwards is the expensive
  // mistake on this page: it is the answer to "тэнцэхгүй бол яах вэ".
  it('keeps the two balance dates in the order the services actually use', async () => {
    const result = await ask();
    expect(result.dualTrack.scholarship.balanceWhenMn).toContain('тэнцсэний дараа');
    expect(result.dualTrack.regular.balanceWhenMn).toContain('Виз гарсны дараа');
  });

  it('leaves a price null rather than inventing one when no row is effective', async () => {
    const bare = new GksEligibilityService({ publicPricing: async () => [] } as never);
    const result = await bare.check({
      degree: 'MASTER',
      age: 25,
      education: EducationLevel.BACHELOR,
      graduating: false,
      gpa: 3.2,
      gpaScale: '4.0',
      topik: 4,
      english: 'INTERMEDIATE',
      strengths: [],
      blockers: [],
    } as QueryGksEligibilityDto);
    expect(result.dualTrack.scholarship.totalAmount).toBeNull();
    expect(result.dualTrack.regular.totalAmount).toBeNull();
  });

  it('routes a research-led applicant to the university track and everyone else to the embassy', async () => {
    expect((await ask()).track.key).toBe('EMBASSY');
    expect((await ask({ degree: 'PHD', education: EducationLevel.MASTER, age: 30 })).track.key).toBe('UNIVERSITY');
  });

  // The visitor reads this text too — it lands in the consultation form's note
  // field — so it names the thin parts rather than carrying a mark.
  it('hands the office a note that already contains the profile', async () => {
    const result = await ask({ topik: 3 });
    expect(result.consultationNote).toContain('TOPIK 3');
    expect(result.consultationNote).toContain('Дутуу тал');
    expect(result.consultationNote).not.toMatch(/оноо/i);
  });

  it('offers at most four moves, biggest first', async () => {
    const result = await ask();
    expect(result.improvements.length).toBeLessThanOrEqual(4);
    expect(result.improvements[0]!.impact).toBe('HIGH');
  });
});


/**
 * 1N-33. The grade and the scale are two separate taps, and the second one is
 * easy to leave wrong. Asserted against the real pipe from `main.ts`, because
 * that is what decides whether a mismatched pair ever reaches the service.
 */
describe('QueryGksEligibilityDto — gpa against its scale (1N-33)', () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const metadata = { type: 'query' as const, metatype: QueryGksEligibilityDto };

  const validate = (gpa: string, gpaScale: string) =>
    pipe.transform(
      { degree: 'BACHELOR', age: '18', education: EducationLevel.SECONDARY_SCHOOL, gpa, gpaScale },
      metadata,
    );

  /** The pipe answers with a Mongolian message array, not with `error.message`. */
  const errors = async (gpa: string, gpaScale: string): Promise<string[]> => {
    try {
      await validate(gpa, gpaScale);
      return [];
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as { message?: string[] };
      return response.message ?? [];
    }
  };

  it('rejects a 100-point average left on a 4.0 scale', async () => {
    // Before this, `gpa=85` with scale 4.0 was clamped to 4 and read as a
    // perfect 100 — a failing criterion turned into a top mark.
    expect(await errors('85', '4.0')).toContainEqual(expect.stringContaining('4.0 системд'));
  });

  it('accepts a grade that fits the scale it was given on', async () => {
    await expect(validate('3.4', '4.0')).resolves.toMatchObject({ gpa: 3.4, gpaScale: '4.0' });
    await expect(validate('85', '100')).resolves.toMatchObject({ gpa: 85, gpaScale: '100' });
  });

  it('accepts each scale right up to its own maximum', async () => {
    await expect(validate('4.5', '4.5')).resolves.toMatchObject({ gpa: 4.5 });
    await expect(validate('5', '5.0')).resolves.toMatchObject({ gpa: 5 });
    expect(await errors('4.6', '4.5')).toContainEqual(expect.stringContaining('4.5 системд'));
  });

  it('leaves an unknown scale to its own error rather than adding a second', async () => {
    const messages = await errors('3.4', '4.2');
    expect(messages).toContainEqual(expect.stringContaining('Голч дүнгийн систем'));
    expect(messages.some((message) => message.includes('системд'))).toBe(false);
  });
});

describe('GksEligibilityService — the age cap is read on the entry date (1N-33)', () => {
  it('turns down a 24-year-old whose undergraduate entry is 16 months out', async () => {
    const result = await ask({ age: 24 });
    const age = result.eligibility.criteria.find((row) => row.key === 'AGE');

    // The entry month is always at least a year out for the undergraduate
    // award, so 24 today is 25 or more by then, whatever month this runs in.
    expect(age?.met).not.toBe(true);
  });

  it('still passes somebody clearly under it', async () => {
    const result = await ask({ age: 18 });
    expect(result.eligibility.criteria.find((row) => row.key === 'AGE')?.met).toBe(true);
  });
});
