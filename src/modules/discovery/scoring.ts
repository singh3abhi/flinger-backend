/**
 * Discover ranking v1 (docs/14 §3): transparent rules, no machine learning.
 * score = Σ weight × signal + small jitter. Every signal is in [0, 1].
 */
export const WEIGHTS = {
  activity: 2.0,
  distance: 1.5,
  intentions: 2.0,
  values: 0.8,
  causes: 0.4,
  family: 0.6,
  quality: 0.8,
  reciprocity: 3.0,
  newMember: 1.0,
  jitter: 0.3,
} as const;

const ACTIVITY_HALF_LIFE_DAYS = 3;
const NEW_MEMBER_HOURS = 72;
const TIER_SIZE = 20;
export const DECK_SIZE = 100;

export interface CandidateSignals {
  userId: string;
  distanceKm: number;
  lastActiveAt: Date | null;
  createdAt: Date;
  hopingToFind: string[];
  values: string[];
  causes: string[];
  kidsStatus: string | null;
  familyPlans: string | null;
  photoCount: number;
  promptCount: number;
  hasBio: boolean;
  likedMe: boolean;
}

export interface ViewerSignals {
  hopingToFind: string[];
  values: string[];
  causes: string[];
  familyPlans: string | null;
}

const DAY_MS = 86_400_000;

/** Share of `mine` that also appears in `theirs` (0 when I answered nothing). */
function overlap(mine: readonly string[], theirs: readonly string[]): number {
  if (mine.length === 0 || theirs.length === 0) return 0;
  return mine.filter((v) => theirs.includes(v)).length / mine.length;
}

/** Family plans that clearly clash (one wants kids, the other doesn't). */
function familyFit(mine: string | null, theirs: string | null): number {
  if (!mine || !theirs) return 0.5;
  if (mine === theirs) return 1;
  const clash =
    (mine === 'want_kids' && theirs === 'dont_want_kids') ||
    (mine === 'dont_want_kids' && theirs === 'want_kids');
  return clash ? 0 : 0.6;
}

export function scoreCandidate(
  viewer: ViewerSignals,
  c: CandidateSignals,
  now: Date,
  random: () => number = Math.random,
): number {
  const daysIdle = c.lastActiveAt ? (now.getTime() - c.lastActiveAt.getTime()) / DAY_MS : 30;
  const signals = {
    activity: 0.5 ** (Math.max(0, daysIdle) / ACTIVITY_HALF_LIFE_DAYS),
    distance: 1 / (1 + Math.log1p(Math.max(0, c.distanceKm))),
    intentions: overlap(viewer.hopingToFind, c.hopingToFind),
    values: overlap(viewer.values, c.values),
    causes: overlap(viewer.causes, c.causes),
    family: familyFit(viewer.familyPlans, c.familyPlans),
    quality:
      (Math.min(c.photoCount, 6) / 6 + Math.min(c.promptCount, 3) / 3 + (c.hasBio ? 1 : 0)) / 3,
    reciprocity: c.likedMe ? 1 : 0,
    newMember: now.getTime() - c.createdAt.getTime() < NEW_MEMBER_HOURS * 3_600_000 ? 1 : 0,
    jitter: random(),
  };
  return (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
    (sum, key) => sum + WEIGHTS[key] * signals[key],
    0,
  );
}

/**
 * Order for the deck: best first, but shuffled within tiers of 20 so the deck doesn't feel like a
 * strict ranking and close scores get a fair turn.
 */
export function assembleDeck(
  scored: readonly { userId: string; score: number }[],
  random: () => number = Math.random,
): string[] {
  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, DECK_SIZE);
  const deck: string[] = [];
  for (let i = 0; i < top.length; i += TIER_SIZE) {
    const tier = top.slice(i, i + TIER_SIZE).map((s) => s.userId);
    for (let j = tier.length - 1; j > 0; j -= 1) {
      const k = Math.floor(random() * (j + 1));
      [tier[j], tier[k]] = [tier[k], tier[j]];
    }
    deck.push(...tier);
  }
  return deck;
}

/** What the card shows: "1 km" minimum, whole km under 10, then steps of 5. */
export function roundDistance(km: number): number {
  if (km < 1) return 1;
  if (km < 10) return Math.round(km);
  return Math.round(km / 5) * 5;
}
