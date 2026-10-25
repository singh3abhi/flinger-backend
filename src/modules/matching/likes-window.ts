/**
 * Daily likes reset at 04:00 India time (discussion log D-04), not 24 h after the first like:
 * everyone shares one easy rule ("your likes refresh at 4 am").
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const RESET_HOUR = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LikesWindow {
  /** Stable id of the current window, e.g. "2026-10-26" (the IST date it started on). */
  id: string;
  resetsAt: Date;
}

export function likesWindow(now: Date = new Date()): LikesWindow {
  // Shift so the window starts at midnight, then find that "day".
  const shifted = now.getTime() + IST_OFFSET_MS - RESET_HOUR * 60 * 60 * 1000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return {
    id: new Date(dayStart).toISOString().slice(0, 10),
    resetsAt: new Date(dayStart + DAY_MS - IST_OFFSET_MS + RESET_HOUR * 60 * 60 * 1000),
  };
}
