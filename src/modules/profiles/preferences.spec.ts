import { defaultPreferences } from './preferences';

describe('defaultPreferences', () => {
  it('centres the age range on your own age', () => {
    expect(defaultPreferences(30)).toMatchObject({ minAge: 25, maxAge: 35, maxDistanceKm: 50 });
  });

  it('never goes below 18, and keeps a ten-year window for the youngest members', () => {
    expect(defaultPreferences(19)).toMatchObject({ minAge: 18, maxAge: 28 });
    expect(defaultPreferences(18)).toMatchObject({ minAge: 18, maxAge: 28 });
  });

  it('never goes above 99', () => {
    expect(defaultPreferences(97)).toMatchObject({ minAge: 92, maxAge: 99 });
  });
});
