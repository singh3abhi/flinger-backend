import { randomUUID } from 'node:crypto';
import { bitPositions, sliceParams } from './bloom';

/** The same maths over an in-memory bitset, to measure real behaviour. */
function simulate(added: string[], probes: string[], seed = 'seed') {
  const slices: Set<number>[] = [new Set()];
  const counts = [0];
  for (const id of added) {
    let last = slices.length - 1;
    if (counts[last] >= sliceParams(last).capacity) {
      slices.push(new Set());
      counts.push(0);
      last += 1;
    }
    for (const bit of bitPositions(seed, id, sliceParams(last))) slices[last].add(bit);
    counts[last] += 1;
  }
  const seen = (id: string) =>
    slices.some((bits, i) => bitPositions(seed, id, sliceParams(i)).every((b) => bits.has(b)));
  return { seen, slices: slices.length };
}

describe('Bloom filter maths', () => {
  it('sizes slice 0 for 1,000 ids at ~1 KB and grows each slice', () => {
    const first = sliceParams(0);
    expect(first.capacity).toBe(1000);
    expect(first.bits / 8).toBeLessThan(1500);
    expect(sliceParams(1).capacity).toBe(2000);
    expect(sliceParams(1).hashes).toBeGreaterThan(first.hashes);
  });

  it('positions are deterministic per seed and spread across the slice', () => {
    const params = sliceParams(0);
    const a = bitPositions('s1', 'user-1', params);
    expect(bitPositions('s1', 'user-1', params)).toEqual(a);
    expect(bitPositions('s2', 'user-1', params)).not.toEqual(a);
    expect(a.every((p) => p >= 0 && p < params.bits)).toBe(true);
    expect(new Set(a).size).toBe(a.length);
  });

  it('always gives valid bit offsets (never negative, always inside the slice)', () => {
    for (const index of [0, 1, 2]) {
      const params = sliceParams(index);
      for (let i = 0; i < 5000; i += 1) {
        for (const bit of bitPositions('seed', randomUUID(), params)) {
          if (!Number.isInteger(bit) || bit < 0 || bit >= params.bits) {
            throw new Error(`bad offset ${bit} for slice ${index}`);
          }
        }
      }
    }
  });

  it('never forgets an added id, across slices', () => {
    const added = Array.from({ length: 3500 }, () => randomUUID());
    const { seen, slices } = simulate(added, []);
    expect(slices).toBe(3); // 1,000 + 2,000 + rest
    expect(added.every(seen)).toBe(true);
  });

  it('keeps false positives at about 1% or less', () => {
    const added = Array.from({ length: 3000 }, () => randomUUID());
    const probes = Array.from({ length: 20000 }, () => randomUUID());
    const { seen } = simulate(added, probes);
    const rate = probes.filter(seen).length / probes.length;
    expect(rate).toBeLessThan(0.012);
  });
});
