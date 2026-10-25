/**
 * Product limits agreed in docs/11-requirements.md. Services enforce them; GET /v1/config
 * publishes them so clients validate with the same numbers. Change a limit here, in one place.
 */
export const LIMITS = {
  photosMin: 4,
  photosMax: 6,
  promptsRequired: 3,
  promptMaxLength: 150,
  bioMaxLength: 500,
  messageMaxLength: 2000,
  /** Free-plan likes per day. Read through an entitlement later so plans can change it. */
  dailyLikes: 25,
  minAge: 18,
} as const;
