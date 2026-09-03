import { z } from 'zod';

/** Brokerage service lines (ARCHITECTURE.md §5). */
export const serviceTypeSchema = z.enum([
  'LANGUAGE_PREP',
  'BACHELOR',
  'MASTER',
  'PHD',
  'GKS_SCHOLARSHIP',
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const educationLevelSchema = z.enum([
  'SECONDARY_SCHOOL',
  'VOCATIONAL',
  'BACHELOR',
  'MASTER',
  'PHD',
]);
export type EducationLevel = z.infer<typeof educationLevelSchema>;

/** Mongolian mobile number once separators are stripped. */
export const phoneSchema = z
  .string()
  .transform((value) => value.replace(/[\s()+-]/g, ''))
  .refine((value) => /^(976)?\d{8}$/.test(value), { message: 'Утасны дугаараа зөв оруулна уу' });

/**
 * Consultation request from the public website. Mirrors the API's
 * `CreatePublicLeadDto` — keep both in step when a field changes (1A-15).
 */
export const publicLeadSchema = z.object({
  lastName: z.string().trim().min(2, 'Овгоо оруулна уу').max(60),
  firstName: z.string().trim().min(2, 'Нэрээ оруулна уу').max(60),
  phone: phoneSchema,
  email: z.email('Имэйл хаяг буруу байна').max(200).optional().or(z.literal('')),
  age: z.number().int().min(14).max(70).optional(),
  educationLevel: educationLevelSchema.optional(),
  gpa: z.number().min(0).max(100).optional(),
  koreanLevel: z.string().max(60).optional(),
  englishLevel: z.string().max(60).optional(),
  interestedServices: z.array(serviceTypeSchema).max(5).optional(),
  interestedUniversitySlugs: z.array(z.string().max(120)).max(10).optional(),
  interestedMajor: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  utm: z
    .object({
      source: z.string().max(120).optional(),
      medium: z.string().max(120).optional(),
      campaign: z.string().max(120).optional(),
      landingPage: z.string().max(500).optional(),
      referrer: z.string().max(500).optional(),
    })
    .optional(),
  /** Honeypot — must stay empty. */
  website: z.string().max(200).optional(),
});

export type PublicLeadInput = z.input<typeof publicLeadSchema>;
export type PublicLeadPayload = z.output<typeof publicLeadSchema>;
