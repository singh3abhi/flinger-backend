/** Flinger is India-only for now, so "today" (birthdays, age checks) is the date in IST. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's calendar date in India as YYYY-MM-DD. */
export function todayInIndia(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Whole years between a YYYY-MM-DD birth date and a YYYY-MM-DD day. A 29 Feb birthday counts on 1 Mar. */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}
