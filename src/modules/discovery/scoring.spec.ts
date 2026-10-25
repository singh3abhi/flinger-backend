import {
  assembleDeck,
  roundDistance,
  scoreCandidate,
  type CandidateSignals,
  type ViewerSignals,
} from './scoring';

const NOW = new Date('2026-10-26T12:00:00Z');
const viewer: ViewerSignals = {
  hopingToFind: ['long_term_relationship'],
  values: ['kindness', 'honesty'],
  causes: [],
  familyPlans: 'want_kids',
};
const base: CandidateSignals = {
  userId: 'c',
  distanceKm: 5,
  lastActiveAt: NOW,
  createdAt: new Date('2026-01-01'),
  hopingToFind: ['long_term_relationship'],
  values: ['kindness'],
  causes: [],
  kidsStatus: null,
  familyPlans: 'want_kids',
  photoCount: 4,
  promptCount: 3,
  hasBio: false,
  likedMe: false,
};
const noJitter = () => 0;
const score = (over: Partial<CandidateSignals>) =>
  scoreCandidate(viewer, { ...base, ...over }, NOW, noJitter);

describe('scoreCandidate', () => {
  it('prefers people who are active, close and want the same thing', () => {
    expect(score({})).toBeGreaterThan(score({ lastActiveAt: new Date('2026-10-10') }));
    expect(score({})).toBeGreaterThan(score({ distanceKm: 80 }));
    expect(score({})).toBeGreaterThan(score({ hopingToFind: ['casual'] }));
  });

  it('ranks someone who already liked me highest, all else equal', () => {
    expect(score({ likedMe: true }) - score({})).toBeCloseTo(3.0);
  });

  it('boosts new members for 72 hours', () => {
    expect(score({ createdAt: new Date('2026-10-25T12:00:00Z') })).toBeGreaterThan(score({}));
    expect(score({ createdAt: new Date('2026-10-22T12:00:00Z') })).toBeCloseTo(score({}));
  });

  it('marks clashing family plans down', () => {
    expect(score({ familyPlans: 'dont_want_kids' })).toBeLessThan(
      score({ familyPlans: 'not_sure' }),
    );
  });
});

describe('assembleDeck', () => {
  it('keeps tiers in order but shuffles inside each tier, capped at 100', () => {
    const scored = Array.from({ length: 150 }, (_, i) => ({ userId: `u${i}`, score: 1000 - i }));
    const deck = assembleDeck(scored, () => 0.42);
    expect(deck).toHaveLength(100);
    expect(new Set(deck.slice(0, 20))).toEqual(new Set(scored.slice(0, 20).map((s) => s.userId)));
    expect(new Set(deck.slice(80, 100))).toEqual(
      new Set(scored.slice(80, 100).map((s) => s.userId)),
    );
    expect(deck.slice(0, 20)).not.toEqual(scored.slice(0, 20).map((s) => s.userId));
  });
});

describe('roundDistance', () => {
  it('never shows exact distances', () => {
    expect(roundDistance(0.2)).toBe(1);
    expect(roundDistance(3.4)).toBe(3);
    expect(roundDistance(12)).toBe(10);
    expect(roundDistance(13)).toBe(15);
  });
});
