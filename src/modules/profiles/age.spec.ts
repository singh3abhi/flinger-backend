import { ageOn, todayInIndia } from './age';

describe('age', () => {
  it('counts whole years and only ticks over on the birthday', () => {
    expect(ageOn('2008-03-14', '2026-03-13')).toBe(17);
    expect(ageOn('2008-03-14', '2026-03-14')).toBe(18);
    expect(ageOn('1996-03-14', '2026-10-25')).toBe(30);
  });

  it('treats a 29 February birthday as reached on 1 March in non-leap years', () => {
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17);
    expect(ageOn('2008-02-29', '2026-03-01')).toBe(18);
  });

  it('uses the date in India, which is ahead of UTC', () => {
    // 20:00 UTC on 13 March is 01:30 IST on 14 March.
    expect(todayInIndia(new Date('2026-03-13T20:00:00Z'))).toBe('2026-03-14');
    expect(todayInIndia(new Date('2026-03-13T18:00:00Z'))).toBe('2026-03-13');
  });
});
