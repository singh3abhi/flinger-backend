/** Defaults for "who to show me", set when onboarding finishes. Members change them later. */
export const DEFAULT_MAX_DISTANCE_KM = 50;
const AGE_SPREAD = 5;
const MIN_AGE = 18;
const MAX_AGE = 99;

export interface PreferencesValues {
  minAge: number;
  maxAge: number;
  maxDistanceKm: number;
  showDistance: boolean;
  expandRadiusWhenEmpty: boolean;
}

/** People within five years either side of your own age, inside 50 km. */
export function defaultPreferences(age: number): PreferencesValues {
  const minAge = Math.max(MIN_AGE, age - AGE_SPREAD);
  const maxAge = Math.min(MAX_AGE, Math.max(age + AGE_SPREAD, minAge + 2 * AGE_SPREAD));
  return {
    minAge,
    maxAge,
    maxDistanceKm: DEFAULT_MAX_DISTANCE_KM,
    showDistance: true,
    expandRadiusWhenEmpty: true,
  };
}
