import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { LIMITS } from '@/common/limits';
import { ONBOARDING_STEPS } from '../onboarding';
import {
  CAUSES,
  CONSENT_DOCUMENTS,
  DISPLAY_NAME,
  FAMILY_PLANS,
  GENDERS,
  HEIGHT_CM,
  HOPING_TO_FIND,
  INTERESTED_IN,
  KIDS_STATUS,
  POLITICS,
  RELIGIONS,
  VALUES,
  ATTRIBUTE_RULES,
} from '../profile-options';

const gender = z.enum(GENDERS);
const interestedIn = z.enum(INTERESTED_IN);
const hopingToFind = z.enum(HOPING_TO_FIND);
const value = z.enum(VALUES);
const cause = z.enum(CAUSES);
const kidsStatus = z.enum(KIDS_STATUS);
const familyPlans = z.enum(FAMILY_PLANS);
const religion = z.enum(RELIGIONS);
const politics = z.enum(POLITICS);

/** A multi-select answer: no duplicates, at most `max` choices. */
function choices<T extends z.ZodType<string>>(item: T, max: number) {
  return z
    .array(item)
    .max(max)
    .refine((list) => new Set(list).size === list.length, 'each option can be picked once');
}

// ---- Own profile (GET and PATCH /me/profile)
export const profilePromptSchema = z.object({
  promptId: z.string(),
  /** The prompt question, e.g. "A perfect Sunday looks like…". */
  text: z.string(),
  answer: z.string(),
  position: z.number().int().min(1).max(LIMITS.promptsRequired),
});

export const onboardingProgressSchema = z.object({
  /** True once every required step is done (the account may still need finishing). */
  completed: z.boolean(),
  nextStep: z.enum(ONBOARDING_STEPS).nullable(),
  missing: z.array(z.enum(ONBOARDING_STEPS)),
});

export const myProfileSchema = z.object({
  displayName: z.string().nullable(),
  /** YYYY-MM-DD. Cannot be changed once set. */
  birthDate: z.iso.date().nullable(),
  age: z.number().int().nullable(),
  gender: gender.nullable(),
  heightCm: z.number().int().nullable(),
  kidsStatus: kidsStatus.nullable(),
  familyPlans: familyPlans.nullable(),
  religion: religion.nullable(),
  politics: politics.nullable(),
  bio: z.string().nullable(),
  interestedIn: z.array(interestedIn),
  hopingToFind: z.array(hopingToFind),
  values: z.array(value),
  causes: z.array(cause),
  prompts: z.array(profilePromptSchema),
  onboarding: onboardingProgressSchema,
});
export class MyProfileDto extends createZodDto(myProfileSchema) {}

/**
 * Save answers step by step. Every field is optional; send only what changed. Optional questions
 * accept `null` to clear them. Multi-selects replace the whole list.
 */
export const updateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(DISPLAY_NAME.min)
      .max(DISPLAY_NAME.max)
      .regex(
        /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u,
        'letters, spaces, dots, apostrophes and dashes only',
      ),
    birthDate: z.iso.date(),
    gender,
    heightCm: z.number().int().min(HEIGHT_CM.min).max(HEIGHT_CM.max),
    kidsStatus: kidsStatus.nullable(),
    familyPlans: familyPlans.nullable(),
    religion: religion.nullable(),
    politics: politics.nullable(),
    bio: z.string().trim().max(LIMITS.bioMaxLength).nullable(),
    interestedIn: choices(interestedIn, ATTRIBUTE_RULES.interested_in.max),
    hopingToFind: choices(hopingToFind, ATTRIBUTE_RULES.hoping_to_find.max),
    values: choices(value, ATTRIBUTE_RULES.values.max),
    causes: choices(cause, ATTRIBUTE_RULES.causes.max),
  })
  .partial()
  .strict();
export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ---- Prompts
export const promptSchema = z.object({
  id: z.string(),
  text: z.string(),
  category: z.string(),
});
export const promptListSchema = z.object({ items: z.array(promptSchema) });
export class PromptListDto extends createZodDto(promptListSchema) {}

export const setPromptsSchema = z.object({
  /** In display order. Up to 3, each prompt used once. */
  prompts: z
    .array(
      z.object({
        promptId: z.string().min(1).max(64),
        answer: z.string().trim().min(1).max(LIMITS.promptMaxLength),
      }),
    )
    .max(LIMITS.promptsRequired)
    .refine(
      (list) => new Set(list.map((p) => p.promptId)).size === list.length,
      'each prompt can be used once',
    ),
});
export class SetPromptsDto extends createZodDto(setPromptsSchema) {}

// ---- Consents
export const acceptConsentsSchema = z.object({
  documents: z
    .array(z.enum(CONSENT_DOCUMENTS))
    .min(1)
    .refine((list) => new Set(list).size === list.length, 'each document once'),
  /** The version shown to the person (from GET /v1/config `legalVersion`). */
  version: z.string().min(1).max(32),
});
export class AcceptConsentsDto extends createZodDto(acceptConsentsSchema) {}
