/**
 * Allowed answer ids for the onboarding questionnaire. Ids are part of the API contract (they are
 * stored and published in the OpenAPI enums); labels live in the apps' translations.
 * Ids come from the Flutter prototype's profile_mappings.dart. Add ids freely; never rename one.
 */
export const GENDERS = ['woman', 'man', 'non_binary'] as const;

export const INTERESTED_IN = ['men', 'women', 'non_binary'] as const;

export const HOPING_TO_FIND = [
  'long_term_relationship',
  'life_partner',
  'casual',
  'intimacy_no_commitment',
  'marriage',
  'ethical_non_monogamy',
] as const;

export const VALUES = [
  'ambition',
  'confidence',
  'curiosity',
  'emotional_intelligence',
  'kindness',
  'honesty',
  'sense_of_humor',
  'empathy',
  'open_mindedness',
  'good_communication',
  'emotional_availability',
  'independence',
  'loyalty',
  'growth_mindset',
  'respect',
] as const;

export const KIDS_STATUS = ['have_kids', 'no_kids'] as const;

export const FAMILY_PLANS = ['dont_want_kids', 'want_kids', 'open_to_kids', 'not_sure'] as const;

/** Mormon and Latter-day Saint were dropped for India (discussion log D-08). */
export const RELIGIONS = [
  'agnostic',
  'atheist',
  'buddhist',
  'catholic',
  'christian',
  'hindu',
  'jain',
  'jewish',
  'muslim',
  'sikh',
  'zoroastrian',
  'spiritual',
  'religious',
  'other',
] as const;

export const POLITICS = [
  'apolitical',
  'moderate',
  'left',
  'right',
  'socialist',
  'communist',
] as const;

/** The Flutter list for now (discussion log D-07 asks whether to localise it for India). */
export const CAUSES = [
  'black_lives_matter',
  'disability_rights',
  'end_religious_hate',
  'environmental_protection',
  'feminism',
  'human_rights',
  'immigrant_rights',
  'indigenous_rights',
  'lgbtq_plus_rights',
  'neurodiversity',
  'reproductive_rights',
  'stop_asian_hate',
  'trans_rights',
  'volunteering',
  'voting_rights',
] as const;

/** How many choices each multi-select question takes. `min` applies when completing onboarding. */
export const ATTRIBUTE_RULES = {
  interested_in: { options: INTERESTED_IN, min: 1, max: INTERESTED_IN.length },
  hoping_to_find: { options: HOPING_TO_FIND, min: 1, max: 2 },
  values: { options: VALUES, min: 1, max: 3 },
  causes: { options: CAUSES, min: 0, max: 3 },
} as const;

export type AttributeKind = keyof typeof ATTRIBUTE_RULES;
export const ATTRIBUTE_KINDS = Object.keys(ATTRIBUTE_RULES) as AttributeKind[];

export const HEIGHT_CM = { min: 120, max: 230 } as const;
export const DISPLAY_NAME = { min: 2, max: 30 } as const;
export const MAX_AGE = 100;

export const CONSENT_DOCUMENTS = ['terms', 'privacy', 'guidelines'] as const;
