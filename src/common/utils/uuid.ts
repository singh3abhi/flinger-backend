import { randomBytes } from 'node:crypto';

let lastMs = 0;
let counter = 0;

/**
 * UUID version 7 (RFC 9562): a 48-bit millisecond timestamp, a 12-bit counter, then random bits.
 * Time-ordered, so new rows append to the end of indexes and IDs sort by creation time.
 * Monotonic within this process (RFC 9562 §6.2 method 1): ids made in the same millisecond still
 * increase. Safe to expose and shard-friendly (no central sequence).
 */
export function uuidv7(now: number = Date.now()): string {
  let ms = now;
  // Same millisecond, or the clock stepped back a little: keep counting up from the last id.
  // A big jump back (or an explicit old timestamp) starts again from `now`.
  if (ms <= lastMs && lastMs - ms < 1000) {
    ms = lastMs;
    counter += 1;
    if (counter > 0xfff) {
      ms += 1;
      counter = 0;
    }
  } else {
    counter = randomBytes(2).readUInt16BE(0) & 0x3ff; // random start, room to count up
  }
  lastMs = ms;

  const bytes = randomBytes(16);
  // 48-bit big-endian timestamp
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f); // version 7 + counter high bits
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
