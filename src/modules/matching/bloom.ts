import { createHash } from 'node:crypto';

/**
 * Scalable Bloom filter maths (docs/14 §3). Slice 0 holds 1,000 ids; each new slice doubles the
 * capacity and halves the false-positive rate, so the total stays under 1% however long the
 * history grows (0.5% + 0.25% + ... < 1%).
 */
const BASE_CAPACITY = 1000;
const BASE_FALSE_POSITIVE = 0.005;

export interface SliceParams {
  /** Ids this slice holds before the next slice starts. */
  capacity: number;
  bits: number;
  hashes: number;
}

export function sliceParams(index: number): SliceParams {
  const capacity = BASE_CAPACITY * 2 ** index;
  const p = BASE_FALSE_POSITIVE / 2 ** index;
  return {
    capacity,
    bits: Math.ceil((-capacity * Math.log(p)) / Math.LN2 ** 2),
    hashes: Math.ceil(Math.log2(1 / p)),
  };
}

/**
 * The bit positions for `item` (double hashing: h1 + i·h2). The seed changes when a filter is
 * rebuilt, so the rare false positives land on different people each time.
 */
export function bitPositions(seed: string, item: string, params: SliceParams): number[] {
  const digest = createHash('sha256').update(`${seed}:${item}`).digest();
  const h1 = digest.readUInt32BE(0);
  // `>>> 0` keeps it unsigned: `x | 1` alone yields a signed int32, i.e. negative positions.
  const h2 = (digest.readUInt32BE(4) | 1) >>> 0;
  return Array.from({ length: params.hashes }, (_, i) => (h1 + i * h2) % params.bits);
}
