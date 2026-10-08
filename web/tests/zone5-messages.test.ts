import { describe, it, expect } from 'vitest';
import {
  ZONE5_MESSAGE_DEFAULTS,
  ZONE5_MESSAGE_KEYS,
  Zone5MessagesSchema,
  fillZone5Template,
  mergeZone5Messages,
  unknownPlaceholders,
  shortRunDate,
  windowLabel,
  templateCity,
  templateFirstName,
} from '@/lib/zone5-messages';

// Client 2026-10-08: the Zone 5 texts, editable in Mission Control
describe('Zone 5 message templates', () => {
  it("keeps the client's wording, with the threshold filled per band and no referral link", () => {
    expect(ZONE5_MESSAGE_DEFAULTS.routeConfirmed).toBe(
      'First Eleven Cleaners: Good news, [First name]. Your [City] pickup is confirmed for Wed [date], [window]. Have your bag at the door. Return is Wed [date+7]. Questions? Just reply.'
    );
    expect(ZONE5_MESSAGE_DEFAULTS.onTheList).toContain('reaches [threshold] pickups');
    expect(ZONE5_MESSAGE_DEFAULTS.routeNotReached).toContain('Reply SKIP to come off the list.');
    expect(ZONE5_MESSAGE_DEFAULTS.routeNotReached).not.toContain('[link]');
    for (const key of ZONE5_MESSAGE_KEYS) {
      expect(unknownPlaceholders(ZONE5_MESSAGE_DEFAULTS[key])).toEqual([]);
      expect(ZONE5_MESSAGE_DEFAULTS[key]).not.toMatch(/[—–]/);
    }
  });

  it('fills a Band B "not reached" text', () => {
    const text = fillZone5Template(ZONE5_MESSAGE_DEFAULTS.routeNotReached, {
      'First name': 'Dana',
      City: 'Denison',
      threshold: '4',
      date: shortRunDate('2026-10-21'),
      'date+7': shortRunDate('2026-10-28'),
    });
    expect(text).toBe(
      "First Eleven Cleaners: Hi Dana, Denison didn't reach 4 pickups this week, so Wed Oct 21 won't run. You stay on the list for Wed Oct 28 at no charge. Reply SKIP to come off the list."
    );
  });

  it('fills the confirmed text with the window', () => {
    const text = fillZone5Template(ZONE5_MESSAGE_DEFAULTS.routeConfirmed, {
      'First name': 'Dana',
      City: 'Sherman',
      date: 'Oct 21',
      'date+7': 'Oct 28',
      window: windowLabel('morning'),
    });
    expect(text).toContain('confirmed for Wed Oct 21, 7:30 to 10:00 AM.');
    expect(text).toContain('Return is Wed Oct 28.');
    expect(windowLabel('evening')).toBe('5:00 to 8:00 PM');
  });

  it('drops a placeholder with no value instead of leaving brackets', () => {
    expect(fillZone5Template('Hi [First name], see [link]', { 'First name': 'Al' })).toBe('Hi Al, see');
  });

  it('greets safely: no name gives "friend", no city gives "your area"', () => {
    expect(templateFirstName(null)).toBe('friend');
    expect(templateFirstName('Dana Lee')).toBe('Dana');
    expect(templateCity('')).toBe('your area');
    expect(templateCity(' Sherman <a> ')).toBe('Sherman a');
  });

  it('rejects unknown placeholders, empty and over-long messages', () => {
    const bad = { ...ZONE5_MESSAGE_DEFAULTS, routeConfirmed: 'Hi [Name], your pickup is confirmed.' };
    expect(unknownPlaceholders(bad.routeConfirmed)).toEqual(['Name']);
    expect(Zone5MessagesSchema.safeParse(bad).success).toBe(false);
    expect(Zone5MessagesSchema.safeParse({ ...ZONE5_MESSAGE_DEFAULTS, onTheList: '' }).success).toBe(false);
    expect(Zone5MessagesSchema.safeParse({ ...ZONE5_MESSAGE_DEFAULTS, onTheList: 'x'.repeat(481) }).success).toBe(false);
    expect(Zone5MessagesSchema.safeParse(ZONE5_MESSAGE_DEFAULTS).success).toBe(true);
  });

  it('merges saved messages over the defaults, ignoring broken ones', () => {
    const merged = mergeZone5Messages({ routeConfirmed: 'Confirmed for Wed [date], [First name]!', onTheList: 'Bad [Nope] template here ok' });
    expect(merged.routeConfirmed).toBe('Confirmed for Wed [date], [First name]!');
    expect(merged.onTheList).toBe(ZONE5_MESSAGE_DEFAULTS.onTheList);
    expect(mergeZone5Messages(null)).toEqual(ZONE5_MESSAGE_DEFAULTS);
  });
});
