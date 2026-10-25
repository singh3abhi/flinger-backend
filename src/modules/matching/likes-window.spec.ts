import { likesWindow } from './likes-window';

describe('likesWindow', () => {
  it('resets at 04:00 IST (22:30 UTC the day before)', () => {
    // 03:59 IST on 26 Oct = 22:29 UTC on 25 Oct: still the 25 Oct window.
    const before = likesWindow(new Date('2026-10-25T22:29:00Z'));
    expect(before.id).toBe('2026-10-25');
    expect(before.resetsAt.toISOString()).toBe('2026-10-25T22:30:00.000Z');

    // 04:00 IST on 26 Oct: a new window.
    const after = likesWindow(new Date('2026-10-25T22:30:00Z'));
    expect(after.id).toBe('2026-10-26');
    expect(after.resetsAt.toISOString()).toBe('2026-10-26T22:30:00.000Z');
  });

  it('keeps the evening and early morning in the same window', () => {
    const evening = likesWindow(new Date('2026-10-26T17:00:00Z')); // 22:30 IST
    const night = likesWindow(new Date('2026-10-26T21:00:00Z')); // 02:30 IST next day
    expect(evening.id).toBe(night.id);
  });
});
