import { z } from 'zod';
import { ORDER_TWO_DISCOUNT } from '@/lib/constants';
import { ZONE5_MESSAGE_DEFAULTS, ZONE5_MESSAGE_INFO, ZONE5_PLACEHOLDERS, unknownPlaceholders as unknownZone5Placeholders, type Zone5MessageKey } from '@/lib/zone5-messages';

/**
 * A/B message tests (client 2026-10-14): "I need to be able to run two versions of any message
 * (A/B) and see sends, taps, and bookings for each." The messages that drive order two first:
 * the Day 6 nudge, the delivered text's "Book next week's pickup?" line, the Google review
 * request (client review 2026-10-20), and the six Zone 5
 * texts (their version A is edited in the Zone 5 panel, as before). Each customer gets the same
 * version of a message every time (A or B, 50/50); with B off, everyone gets A. A booking counts
 * for a version when that customer books within 7 days of it. Client-safe; the database side is
 * lib/message-tests-store.ts (app_settings 'message_tests', table message_sends).
 */
export const BOOKED_WITHIN_DAYS = 7;

export const ORDER_TWO_KEYS = ['order_two_nudge', 'delivered_rebook'] as const;
/** Messages whose version A is edited on this tab (Zone 5's are edited in their own panel) */
export const OWN_TEXT_KEYS = [...ORDER_TWO_KEYS, 'review_request'] as const;
export type OwnTextMessageKey = (typeof OWN_TEXT_KEYS)[number];
export type TestedMessageKey = OwnTextMessageKey | Zone5MessageKey;

export interface TestedMessageInfo {
  key: TestedMessageKey;
  label: string;
  when: string;
  /** Placeholders the text may use, as [Name] */
  placeholders: readonly string[];
  /** A placeholder every version must keep (the tracked link) */
  required?: string;
  /** Version A is edited in the Zone 5 panel */
  zone5?: boolean;
}

export const OWN_TEXT_DEFAULTS: Record<OwnTextMessageKey, string> = {
  order_two_nudge: `Eleven at First Eleven Cleaners: Hi [First name], ready for round two? Your next pickup is one tap away, and it's $${ORDER_TWO_DISCOUNT} off: [link]. Reply STOP to opt out.`,
  delivered_rebook: "Book next week's pickup? [link]",
  // Client review 2026-10-20 (#14): asked of every customer, whatever they told us (no review gating)
  review_request:
    'First Eleven Cleaners: Hi [First name], thank you for trusting us with your garments. How did we do? A short Google review helps other DFW customers find us: [link]. Reply STOP to opt out.',
};

export const TESTED_MESSAGES: readonly TestedMessageInfo[] = [
  { key: 'order_two_nudge', label: 'Day 6 nudge', when: '6 days after a first delivery, with no second order (once).', placeholders: ['First name', 'link'], required: 'link' },
  { key: 'delivered_rebook', label: 'Delivered: book next week', when: 'The end of the delivered text, for one-time customers.', placeholders: ['link'], required: 'link' },
  { key: 'review_request', label: 'Google review request', when: 'The day after a delivery, once per customer.', placeholders: ['First name', 'link'], required: 'link' },
  ...(Object.keys(ZONE5_MESSAGE_DEFAULTS) as Zone5MessageKey[]).map((key) => ({
    key,
    label: `Zone 5: ${ZONE5_MESSAGE_INFO[key].label}`,
    when: ZONE5_MESSAGE_INFO[key].when,
    placeholders: ZONE5_PLACEHOLDERS,
    zone5: true,
  })),
];

export function testedMessage(key: string): TestedMessageInfo | undefined {
  return TESTED_MESSAGES.find((m) => m.key === key);
}

/** One message's test: version B, whether it's on, an A text for the order-two messages, and when the count started. */
export interface MessageTest {
  a?: string;
  b: string;
  bOn: boolean;
  countFrom: string | null;
}
export type MessageTests = Partial<Record<TestedMessageKey, MessageTest>>;

/** A, or B for half the customers (always the same half for a message) while B is on. */
export function variantFor(recipient: string, key: string, test: MessageTest | undefined): 'A' | 'B' {
  if (!test?.bOn || !test.b.trim()) return 'A';
  // FNV-1a: the same customer always lands on the same side
  let hash = 0x811c9dc5;
  for (const ch of `${key}:${recipient}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 2 === 0 ? 'A' : 'B';
}

/** The text for a version: B's, the saved A, or the default (Zone 5 A comes from its own panel). */
export function textFor(key: TestedMessageKey, variant: 'A' | 'B', test: MessageTest | undefined, zone5A?: string): string {
  if (variant === 'B' && test?.b.trim()) return test.b;
  if ((OWN_TEXT_KEYS as readonly string[]).includes(key)) return test?.a?.trim() || OWN_TEXT_DEFAULTS[key as OwnTextMessageKey];
  return zone5A ?? ZONE5_MESSAGE_DEFAULTS[key as Zone5MessageKey];
}

const PLACEHOLDER = /\[([^\][]+)\]/g;
export function unknownPlaceholders(text: string, allowed: readonly string[]): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((p) => !allowed.includes(p));
}

/** Fills [Placeholders]; one without a value is left out with the space before it. */
export function fillMessage(text: string, values: Record<string, string | undefined>): string {
  return text
    .replace(/ ?\[([^\][]+)\]/g, (match, name: string) => {
      const value = values[name];
      if (!value) return '';
      return match.startsWith(' ') ? ` ${value}` : value;
    })
    .trim();
}

/** Checks a version's text: length, known placeholders, and the tracked link kept. */
export function checkMessageText(key: TestedMessageKey, text: string): string | null {
  const info = testedMessage(key);
  if (!info) return 'Unknown message.';
  const t = text.trim();
  if (t.length < 10) return 'Each version needs at least 10 characters.';
  if (t.length > 480) return 'Keep each version under 480 characters (3 texts).';
  const unknown = info.zone5 ? unknownZone5Placeholders(t) : unknownPlaceholders(t, info.placeholders);
  if (unknown.length) return `Use only these placeholders: ${info.placeholders.map((p) => `[${p}]`).join(', ')}.`;
  if (info.required && !t.includes(`[${info.required}]`)) return `Keep [${info.required}] in the text: it's the link we count taps on.`;
  return null;
}

const TestSchema = z.object({
  a: z.string().max(480).optional(),
  b: z.string().max(480).default(''),
  bOn: z.boolean().default(false),
  countFrom: z.string().nullable().default(null),
});

/** Saved tests, keeping only known messages and valid entries. */
export function mergeMessageTests(value: unknown): MessageTests {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const out: MessageTests = {};
  for (const info of TESTED_MESSAGES) {
    const parsed = TestSchema.safeParse(saved[info.key]);
    if (parsed.success) out[info.key] = parsed.data;
  }
  return out;
}
