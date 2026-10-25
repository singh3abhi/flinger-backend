import { uuidv7 } from './uuid';

describe('uuidv7', () => {
  it('has the version and variant bits of a v7 UUID', () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('embeds the timestamp in the first 48 bits', () => {
    const at = Date.UTC(2026, 9, 25, 12, 0, 0);
    const id = uuidv7(at);
    expect(parseInt(id.replace(/-/g, '').slice(0, 12), 16)).toBe(at);
  });

  it('sorts by creation time', () => {
    const ids = [1_000, 2_000, 3_000, 4_000].map((t) => uuidv7(t));
    expect([...ids].sort()).toEqual(ids);
  });

  it('does not repeat', () => {
    const seen = new Set(Array.from({ length: 5_000 }, () => uuidv7()));
    expect(seen.size).toBe(5_000);
  });
});
