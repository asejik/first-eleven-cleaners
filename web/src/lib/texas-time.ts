/**
 * Dallas (America/Chicago) calendar helpers (P03 PR-13).
 *
 * Servers run in UTC and `toISOString()` is UTC, so "today" flipped to tomorrow at
 * 7 PM Central (6 PM in winter). The business runs on Dallas time; use these instead.
 */
const TZ = 'America/Chicago';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface TexasDateTime {
  /** YYYY-MM-DD in Dallas */
  date: string;
  /** Minutes past midnight in Dallas */
  minutes: number;
  seconds: number;
}

export function texasDateTime(instant: Date = new Date()): TexasDateTime {
  const p = Object.fromEntries(partsFormatter.formatToParts(instant).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
    seconds: Number(p.second),
  };
}

/** Today's (or an instant's) calendar date in Dallas, as YYYY-MM-DD. */
export function texasDate(instant: Date | string = new Date()): string {
  return texasDateTime(typeof instant === 'string' ? new Date(instant) : instant).date;
}

/** Calendar arithmetic on a YYYY-MM-DD date (time-zone independent). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  return utc.toISOString().slice(0, 10);
}

/** Day of week for a YYYY-MM-DD date: 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The UTC instant (ISO string) when a Dallas calendar day starts: 05:00Z in CDT, 06:00Z in CST. */
export function texasDayStartUtc(date: string): string {
  for (const hour of [5, 6]) {
    const candidate = new Date(`${date}T0${hour}:00:00Z`);
    const tx = texasDateTime(candidate);
    if (tx.date === date && tx.minutes === 0) return candidate.toISOString();
  }
  return new Date(`${date}T06:00:00Z`).toISOString(); // unreachable for America/Chicago
}
