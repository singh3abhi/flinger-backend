import { LIMITS } from '@/common/limits';
import { ATTRIBUTE_RULES } from './profile-options';

/**
 * Required onboarding steps, in the order the app shows them. Optional questions (kids and family,
 * beliefs, causes) are not steps: they can be skipped and filled in later from Edit profile.
 */
export const ONBOARDING_STEPS = [
  'basics', // name + birthday
  'gender',
  'interested_in',
  'hoping_to_find',
  'height',
  'values',
  'photos',
  'prompts',
  'location',
  'consents',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingSnapshot {
  displayName: string | null;
  birthDate: string | null;
  gender: string | null;
  heightCm: number | null;
  attributeCounts: Record<keyof typeof ATTRIBUTE_RULES, number>;
  promptCount: number;
  photoCount: number;
  hasLocation: boolean;
  /** All legal documents accepted at the current version. */
  consentsAccepted: boolean;
}

export interface OnboardingProgress {
  completed: boolean;
  /** Where the app should resume; null once everything required is done. */
  nextStep: OnboardingStep | null;
  missing: OnboardingStep[];
}

function isDone(step: OnboardingStep, s: OnboardingSnapshot): boolean {
  switch (step) {
    case 'basics':
      return s.displayName !== null && s.birthDate !== null;
    case 'gender':
      return s.gender !== null;
    case 'height':
      return s.heightCm !== null;
    case 'interested_in':
    case 'hoping_to_find':
    case 'values':
      return s.attributeCounts[step] >= ATTRIBUTE_RULES[step].min;
    case 'photos':
      return s.photoCount >= LIMITS.photosMin;
    case 'prompts':
      return s.promptCount >= LIMITS.promptsRequired;
    case 'location':
      return s.hasLocation;
    case 'consents':
      return s.consentsAccepted;
  }
}

/** Which required steps are still missing. `completed` here means "ready to finish". */
export function onboardingProgress(snapshot: OnboardingSnapshot): OnboardingProgress {
  const missing = ONBOARDING_STEPS.filter((step) => !isDone(step, snapshot));
  return { completed: missing.length === 0, nextStep: missing[0] ?? null, missing };
}
