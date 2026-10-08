import { z } from 'zod';
import { PICKUP_WINDOWS } from '@/lib/constants';
import { greetingFirstName } from '@/lib/sanitize';

/**
 * Zone 5 texts (client 2026-10-08): the client's templates, editable in Mission Control
 * (stored as app_settings key 'zone5_messages' over these defaults). Client-safe.
 * Placeholders are written in square brackets, as the client wrote them: [First name], [City],
 * [date] (the run, "Oct 21"), [date+7] (the next run), [window], [threshold] (3 for Band A,
 * 4 for Band B) and [link] (the booking page).
 */
export const ZONE5_MESSAGE_KEYS = ['onTheList', 'routeConfirmed', 'routeNotReached', 'waitlistJoined', 'thresholdReached', 'zone5Open'] as const;
export type Zone5MessageKey = (typeof ZONE5_MESSAGE_KEYS)[number];
export type Zone5Messages = Record<Zone5MessageKey, string>;

export const ZONE5_PLACEHOLDERS = ['First name', 'City', 'date', 'date+7', 'window', 'threshold', 'link'] as const;
export type Zone5Placeholder = (typeof ZONE5_PLACEHOLDERS)[number];

/** The client's wording, with the threshold filled per band and no referral link yet. */
export const ZONE5_MESSAGE_DEFAULTS: Zone5Messages = {
  onTheList:
    "First Eleven Cleaners: You're on the list for Wednesday pickup in [City]. We confirm routes Monday by 6 PM once your area reaches [threshold] pickups. No charge until we confirm. Reply STOP to opt out.",
  routeConfirmed:
    'First Eleven Cleaners: Good news, [First name]. Your [City] pickup is confirmed for Wed [date], [window]. Have your bag at the door. Return is Wed [date+7]. Questions? Just reply.',
  routeNotReached:
    "First Eleven Cleaners: Hi [First name], [City] didn't reach [threshold] pickups this week, so Wed [date] won't run. You stay on the list for Wed [date+7] at no charge. Reply SKIP to come off the list.",
  waitlistJoined:
    "First Eleven Cleaners: Thanks, [First name]. [City] is just outside our current routes. You're on the waitlist and we'll text you first when we open your area. Reply STOP to opt out.",
  thresholdReached:
    'First Eleven Cleaners: [City] just hit [threshold] pickups. Your Wed [date] pickup is confirmed, [window]. Bag at the door and we handle the rest.',
  zone5Open:
    'First Eleven Cleaners: Good news, [First name]. Extended Reach now serves [City]. Wednesday pickups start Wed [date], back the next Wednesday. Book at [link]. Reply STOP to opt out.',
};

/** What Mission Control shows for each template. */
export const ZONE5_MESSAGE_INFO: Record<Zone5MessageKey, { label: string; when: string }> = {
  onTheList: { label: 'On the list', when: 'A Zone 5 booking lands on a run that is not confirmed yet.' },
  routeConfirmed: { label: 'Route confirmed', when: 'Monday evening, to everyone on a run that is going out.' },
  routeNotReached: { label: 'Route not reached', when: 'Monday evening, to everyone moved to the next run.' },
  waitlistJoined: { label: 'Waitlist', when: 'Someone joins the waitlist (beyond 80 miles, or Zone 5 before its first run).' },
  thresholdReached: { label: 'Threshold reached early', when: 'A booking fills a run before Monday, or Mission Control dispatches it anyway.' },
  zone5Open: { label: 'Zone 5 now open', when: 'The first run date is set: everyone waiting for Zone 5, once.' },
};

const PLACEHOLDER_PATTERN = /\[([^\][]+)\]/g;

/** Placeholders in a template that the site can't fill (typos like [Name]). */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(ZONE5_PLACEHOLDERS);
  return [...template.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]).filter((name) => !known.has(name));
}

/** Fills the placeholders; one without a value is left out (with the space before it). */
export function fillZone5Template(template: string, values: Partial<Record<Zone5Placeholder, string>>): string {
  return template
    .replace(/ ?\[([^\][]+)\]/g, (match, name: string) => {
      const value = values[name as Zone5Placeholder];
      if (value === undefined || value === '') return '';
      return match.startsWith(' ') ? ` ${value}` : value;
    })
    .trim();
}

/** "Oct 21" (the template supplies "Wed"). */
export function shortRunDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "7:30 to 10:00 AM" for a pickup window id; unknown ids pass through. */
export function windowLabel(windowId: string | null | undefined): string {
  const window = PICKUP_WINDOWS.find((w) => w.id === windowId);
  if (!window) return windowId || '';
  const [startTime, startHalf] = window.start.split(' ');
  return startHalf === window.end.split(' ')[1] ? `${startTime} to ${window.end}` : `${window.start} to ${window.end}`;
}

/** The first name for a greeting ("friend" when there isn't one). */
export function templateFirstName(fullName: string | null | undefined): string {
  return greetingFirstName(fullName, 'friend');
}

/** A city for the text: as entered, trimmed, letters and spaces only ("your area" when missing). */
export function templateCity(city: string | null | undefined): string {
  const cleaned = String(city ?? '').replace(/[^\p{L}\p{M} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return cleaned || 'your area';
}

const templateSchema = z
  .string()
  .trim()
  .min(20, 'Each message needs at least 20 characters.')
  .max(480, 'Keep each message under 480 characters (3 texts).')
  .refine((t) => unknownPlaceholders(t).length === 0, {
    message: `Use only these placeholders: ${ZONE5_PLACEHOLDERS.map((p) => `[${p}]`).join(', ')}.`,
  });

export const Zone5MessagesSchema = z.object(
  Object.fromEntries(ZONE5_MESSAGE_KEYS.map((key) => [key, templateSchema])) as Record<Zone5MessageKey, typeof templateSchema>
);

/** Saved templates over the defaults; anything missing or invalid falls back to the default. */
export function mergeZone5Messages(value: unknown): Zone5Messages {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const merged = { ...ZONE5_MESSAGE_DEFAULTS };
  for (const key of ZONE5_MESSAGE_KEYS) {
    const parsed = templateSchema.safeParse(saved[key]);
    if (parsed.success) merged[key] = parsed.data;
  }
  return merged;
}
