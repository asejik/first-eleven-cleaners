import {
  ZONE_CONFIG,
  ZONE_EXPRESS_ELIGIBLE,
  EXTENDED_REACH_DEFAULTS,
  EXTENDED_REACH_FALLBACK_MILES,
  EXPRESS_ENABLED,
  ALL_ROUTE_DAYS,
  extendedReachZone,
  extendedReachBand,
  extendedReachFee,
  routeDaysLabel,
  zoneExpressLabel,
  type ZoneConfig,
  type MetroZoneId,
  type RouteDayName,
  type ExtendedReachBand,
  type ExtendedReachConfig,
} from '@/lib/constants';
import { addDaysToDate, dayOfWeek } from '@/lib/texas-time';
import { estimatedDeliveryDate, type ScheduleTier } from '@/lib/schedule';

/**
 * Coverage rules (client 2026-10-07, request 8, revised). Safe on the client and the server.
 *
 * - The ZIP-to-zone table decides Zones 1-4 (no distance lookup). It starts from the lists in
 *   constants.ts and is edited in Mission Control.
 * - Any other ZIP is placed by DRIVING distance from the hub (lib/distance.ts): Zones 1-4 by
 *   their bands (0-15, 15-25, 25-35, 35-45 mi), Zone 5 Extended Reach in its bands (45-60,
 *   60-80 mi), the waitlist beyond 80 mi. Those ZIPs are logged for review (Mission Control).
 *   Without a distance, Zone 5 towns use their approximate miles and other North Texas ZIPs
 *   are Zone 4.
 * - Zone 5 is on the waitlist until Mission Control sets the first run date.
 * - Every value is editable in Mission Control (lib/coverage-settings.ts); constants.ts holds
 *   the starting values.
 */
export interface MetroZoneSettings {
  minimumOrder: number;
  routeDays: RouteDayName[];
  /** Express offered here while the Express switch is on */
  expressEligible: boolean;
  minMiles: number;
  maxMiles: number;
}

export interface CoverageSettings {
  /** 24-Hour Express master switch (client 8E: off until the plant confirms in writing) */
  expressEnabled: boolean;
  zones: Record<MetroZoneId, MetroZoneSettings>;
  /** ZIP code -> Zone 1-4 (the client's lists; edited in Mission Control) */
  zipZones: Record<string, MetroZoneId>;
  extendedReach: ExtendedReachConfig;
}

export const METRO_ZONE_IDS: MetroZoneId[] = ['zone_1', 'zone_2', 'zone_3', 'zone_4'];

export const DEFAULT_COVERAGE_SETTINGS: CoverageSettings = {
  expressEnabled: EXPRESS_ENABLED,
  zones: Object.fromEntries(
    METRO_ZONE_IDS.map((id) => {
      const z = ZONE_CONFIG[id];
      return [id, { minimumOrder: z.minimumOrder, routeDays: [...z.routeDays], expressEligible: ZONE_EXPRESS_ELIGIBLE[id], minMiles: z.minMiles, maxMiles: z.maxMiles }];
    })
  ) as Record<MetroZoneId, MetroZoneSettings>,
  zipZones: Object.fromEntries(METRO_ZONE_IDS.flatMap((id) => ZONE_CONFIG[id].zipCodes.map((zip) => [zip, id]))),
  extendedReach: EXTENDED_REACH_DEFAULTS,
};

/** The zones as bookings use them, with the saved settings applied. */
export interface Coverage {
  expressEnabled: boolean;
  zones: Record<MetroZoneId, ZoneConfig>;
  /** Zones 1-4, in order */
  zonesList: ZoneConfig[];
  extendedReach: ExtendedReachConfig;
  extendedReachZone: ZoneConfig;
}

const sameDays = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((d) => b.includes(d));

export function buildCoverage(settings: CoverageSettings = DEFAULT_COVERAGE_SETTINGS): Coverage {
  const zones = Object.fromEntries(
    METRO_ZONE_IDS.map((id) => {
      const base = ZONE_CONFIG[id];
      const s = settings.zones[id];
      const expressEligible = settings.expressEnabled && s.expressEligible;
      const zone: ZoneConfig = {
        ...base,
        minimumOrder: s.minimumOrder,
        routeDays: [...s.routeDays],
        // Keep a zone's own wording ("Daily & Alternating Routes") until its days change
        routeScheduleLabel: sameDays(s.routeDays, base.routeDays) ? base.routeScheduleLabel : routeDaysLabel(s.routeDays),
        expressEligible,
        expressLabel: zoneExpressLabel(expressEligible),
        minMiles: s.minMiles,
        maxMiles: s.maxMiles,
        zipCodes: Object.keys(settings.zipZones).filter((zip) => settings.zipZones[zip] === id).sort(),
      };
      return [id, zone];
    })
  ) as Record<MetroZoneId, ZoneConfig>;
  return {
    expressEnabled: settings.expressEnabled,
    zones,
    zonesList: METRO_ZONE_IDS.map((id) => zones[id]),
    extendedReach: settings.extendedReach,
    extendedReachZone: extendedReachZone(settings.extendedReach),
  };
}

export const DEFAULT_COVERAGE = buildCoverage();

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const days = (v: unknown, fallback: RouteDayName[]) =>
  Array.isArray(v) && v.length > 0 && v.every((d) => (ALL_ROUTE_DAYS as string[]).includes(d)) ? (v as RouteDayName[]) : fallback;

/** Saved settings over the defaults; anything missing or malformed keeps its default. */
export function mergeCoverageSettings(saved: unknown): CoverageSettings {
  const d = DEFAULT_COVERAGE_SETTINGS;
  if (!saved || typeof saved !== 'object') return d;
  const s = saved as Partial<{ expressEnabled: unknown; zones: Record<string, Record<string, unknown>>; zipZones: unknown; extendedReach: Record<string, unknown> }>;
  const zones = Object.fromEntries(
    METRO_ZONE_IDS.map((id) => {
      const z = s.zones?.[id] || {};
      const dz = d.zones[id];
      return [id, {
        minimumOrder: num(z.minimumOrder, dz.minimumOrder),
        routeDays: days(z.routeDays, dz.routeDays),
        expressEligible: typeof z.expressEligible === 'boolean' ? z.expressEligible : dz.expressEligible,
        minMiles: num(z.minMiles, dz.minMiles),
        maxMiles: num(z.maxMiles, dz.maxMiles),
      }];
    })
  ) as Record<MetroZoneId, MetroZoneSettings>;
  const e = s.extendedReach || {};
  const de = d.extendedReach;
  const savedBands = Array.isArray(e.bands) ? (e.bands as Array<Record<string, unknown>>) : [];
  const bands = de.bands.map((band) => {
    const b = savedBands.find((x) => x?.id === band.id) || {};
    return {
      id: band.id,
      minMiles: num(b.minMiles, band.minMiles),
      maxMiles: num(b.maxMiles, band.maxMiles),
      fee: num(b.fee, band.fee),
      dispatchThreshold: Math.max(1, Math.round(num(b.dispatchThreshold, band.dispatchThreshold))),
    };
  });
  // A saved first run date, or none (null) once one is cleared
  const firstRunDate =
    typeof e.firstRunDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.firstRunDate)
      ? e.firstRunDate
      : e.firstRunDate === null
        ? null
        : de.firstRunDate;
  // The saved ZIP table replaces the default one whole (it holds removals too)
  const savedZips = s.zipZones && typeof s.zipZones === 'object' ? Object.entries(s.zipZones as Record<string, unknown>) : null;
  const zipZones = savedZips
    ? Object.fromEntries(savedZips.filter(([zip, id]) => /^\d{5}$/.test(zip) && (METRO_ZONE_IDS as string[]).includes(String(id)))) as Record<string, MetroZoneId>
    : d.zipZones;
  return {
    expressEnabled: typeof s.expressEnabled === 'boolean' ? s.expressEnabled : d.expressEnabled,
    zones,
    zipZones,
    extendedReach: {
      minimumOrder: num(e.minimumOrder, de.minimumOrder),
      routineDiscountPercent: Math.min(100, num(e.routineDiscountPercent, de.routineDiscountPercent)),
      waitlistBeyondMiles: num(e.waitlistBeyondMiles, de.waitlistBeyondMiles),
      cadenceWeeks: Math.max(1, Math.round(num(e.cadenceWeeks, de.cadenceWeeks))),
      routeDay: days([e.routeDay], [de.routeDay])[0],
      firstRunDate,
      bookingNoticeDays: Math.max(3, Math.round(num(e.bookingNoticeDays, de.bookingNoticeDays))),
      bands,
    },
  };
}

// --- Resolving an address ---------------------------------------------------------------

export type CoverageResolution =
  | { status: 'incomplete' }
  | {
      status: 'served';
      zone: ZoneConfig;
      /** Driving miles from the hub, when known */
      miles: number | null;
      /** Zone 5 only */
      band: ExtendedReachBand | null;
      /** Not on the ZIP table: placed by distance (logged for review in Mission Control) */
      byDistance?: boolean;
    }
  /**
   * No booking, the waitlist instead: beyond the last band, outside North Texas, or Zone 5
   * before its first run is set ("Extended Reach is coming soon").
   */
  | { status: 'waitlist'; miles: number | null; reason: 'beyond' | 'zone5_not_started'; band?: ExtendedReachBand | null };

const zip5Of = (zip: string) => {
  const cleaned = (zip || '').trim().replace(/[^\d]/g, '');
  return cleaned.length >= 5 ? cleaned.slice(0, 5) : null;
};

/** The miles to use when the routing service has none: the Zone 5 towns' approximate miles. */
export function fallbackMiles(zip: string): number | null {
  const zip5 = zip5Of(zip);
  return zip5 ? EXTENDED_REACH_FALLBACK_MILES[zip5] ?? null : null;
}

/** True when this ZIP is on a Zone 1-4 list (no distance lookup needed). */
export function isListedMetroZip(zip: string, coverage: Coverage = DEFAULT_COVERAGE): boolean {
  const zip5 = zip5Of(zip);
  return Boolean(zip5 && coverage.zonesList.some((z) => z.zipCodes.includes(zip5)));
}

export function resolveCoverage(
  { zip, miles = null }: { zip: string; miles?: number | null },
  coverage: Coverage = DEFAULT_COVERAGE
): CoverageResolution {
  const zip5 = zip5Of(zip);
  if (!zip5) return { status: 'incomplete' };

  const listed = coverage.zonesList.find((z) => z.zipCodes.includes(zip5));
  if (listed) return { status: 'served', zone: listed, miles, band: null };

  const distance = miles ?? fallbackMiles(zip5);
  const reach = coverage.extendedReach;
  if (distance !== null) {
    if (distance > reach.waitlistBeyondMiles) return { status: 'waitlist', miles: distance, reason: 'beyond' };
    const band = extendedReachBand(distance, reach);
    if (band) {
      if (!reach.firstRunDate) return { status: 'waitlist', miles: distance, reason: 'zone5_not_started', band };
      return { status: 'served', zone: coverage.extendedReachZone, miles: distance, band, byDistance: true };
    }
    return { status: 'served', zone: metroZoneByMiles(distance, coverage), miles: distance, band: null, byDistance: true };
  }

  // No distance: other North Texas ZIPs (750-754, 760-762) are Zone 4
  if (/^(75[0-4]|76[0-2])\d{2}$/.test(zip5)) return { status: 'served', zone: coverage.zones.zone_4, miles: null, band: null, byDistance: true };
  return { status: 'waitlist', miles: null, reason: 'beyond' };
}

/** The Zone 1-4 band a distance falls in (0-15, 15-25, 25-35, 35-45 mi); Zone 4 if none does. */
export function metroZoneByMiles(miles: number, coverage: Coverage = DEFAULT_COVERAGE): ZoneConfig {
  return (
    coverage.zonesList.find((z, i) => (i === 0 ? miles >= z.minMiles : miles > z.minMiles) && miles <= z.maxMiles) ??
    coverage.zones.zone_4
  );
}

/** What a Zone 5 address shows the moment it resolves (from /api/coverage/resolve). */
export interface ExtendedReachQuote {
  band: 'A' | 'B';
  fullFee: number;
  routineFee: number;
  routineDiscountPercent: number;
  minimumOrder: number;
  threshold: number;
  /** "Extended Reach: picked up Wednesday, back the next Wednesday." */
  turnaround: string;
  /**
   * The next runs this address can book: the pickups booked, the deliveries due that day, and
   * whether pickups are accepted (threshold met or a delivery run already due)
   */
  runs: Array<{ date: string; booked: number; threshold: number; deliveriesDue: number; dispatched: boolean }>;
}

// --- Routine members (client 8C) -------------------------------------------------------

export type Frequency = 'one_time' | 'weekly' | 'biweekly';

/**
 * A Routine member is a customer on a recurring plan (Weekly or Bi-Weekly). "Join the Routine"
 * picks Bi-Weekly. The standing Routine subscription (client 2026-10-07, revised) replaces this
 * per-booking choice in a later change.
 */
export function isRoutineFrequency(frequency: Frequency | null | undefined): boolean {
  return frequency === 'weekly' || frequency === 'biweekly';
}

/** The fee line for a Zone 5 address, before and after the Routine discount. */
export function extendedReachFeeLine(
  band: ExtendedReachBand | null,
  isRoutineMember: boolean,
  reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach
): { fullFee: number; fee: number; routineFee: number } | null {
  if (!band) return null;
  return {
    fullFee: extendedReachFee(band, false, reach),
    fee: extendedReachFee(band, isRoutineMember, reach),
    routineFee: extendedReachFee(band, true, reach),
  };
}

// --- Route days and cycles --------------------------------------------------------------

const DAY_INDEX: Record<RouteDayName, number> = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

export function dayName(date: string): string {
  return DAY_NAMES[dayOfWeek(date)];
}

/** True when this zone picks up on this date (YYYY-MM-DD). Zone 5: only on its run dates. */
export function isZoneRouteDay(zone: ZoneConfig, date: string, coverage: Coverage = DEFAULT_COVERAGE): boolean {
  if (zone.id === 'zone_5') return isExtendedReachRunDate(date, coverage.extendedReach);
  return zone.routeDays.some((d) => DAY_INDEX[d] === dayOfWeek(date));
}

/** The first route day on or after this date (looks up to 8 weeks ahead). */
export function nextZoneRouteDay(zone: ZoneConfig, fromDate: string, coverage: Coverage = DEFAULT_COVERAGE): string {
  let date = fromDate;
  for (let i = 0; i < 56; i++) {
    if (isZoneRouteDay(zone, date, coverage)) return date;
    date = addDaysToDate(date, 1);
  }
  return fromDate;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** True on a Zone 5 run date: the first run, then every cadenceWeeks weeks (none until it's set). */
export function isExtendedReachRunDate(date: string, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): boolean {
  if (!reach.firstRunDate) return false;
  const diff = daysBetween(reach.firstRunDate, date);
  return diff >= 0 && diff % (7 * reach.cadenceWeeks) === 0;
}

/** The next `count` Zone 5 run dates on or after this date (none until the first run is set). */
export function extendedReachRunDates(fromDate: string, count: number, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string[] {
  if (!reach.firstRunDate) return [];
  const period = 7 * reach.cadenceWeeks;
  const diff = daysBetween(reach.firstRunDate, fromDate);
  const steps = diff <= 0 ? 0 : Math.ceil(diff / period);
  const first = addDaysToDate(reach.firstRunDate, steps * period);
  return Array.from({ length: count }, (_, i) => addDaysToDate(first, i * period));
}

/** The earliest Zone 5 run that can still be booked (bookings close a few days before). */
export function earliestExtendedReachRun(today: string, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string | null {
  return extendedReachRunDates(addDaysToDate(today, reach.bookingNoticeDays), 1, reach)[0] ?? null;
}

/** The run a pickup on this run date comes back on: the next run (weekly: 7 days later). */
export function nextExtendedReachRun(runDate: string, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string {
  return addDaysToDate(runDate, 7 * reach.cadenceWeeks);
}

/**
 * Delivery date for a pickup in this zone. The plant turnaround comes first (2 plant days,
 * Express 1, alterations 5); Zones 3 and 4 then deliver on their next route day (client 8B:
 * a Zone 4 Friday pickup is delivered Tuesday). Zone 5 comes back on the next run: picked up
 * Wednesday, back the next Wednesday (client, revised).
 */
export function zoneDeliveryDate(
  zone: ZoneConfig | null | undefined,
  pickupDate: string,
  tier: ScheduleTier = 'standard',
  { alterations = false }: { alterations?: boolean } = {},
  coverage: Coverage = DEFAULT_COVERAGE
): string {
  if (zone?.id === 'zone_5') return nextExtendedReachRun(pickupDate, coverage.extendedReach);
  const ready = estimatedDeliveryDate(pickupDate, tier, { alterations });
  if (!zone || zone.routeDays.length >= ALL_ROUTE_DAYS.length) return ready;
  return nextZoneRouteDay(zone, ready, coverage);
}

/** A Zone 5 fee as the client writes it: "$35", or "$17.50" with cents. */
export function feeLabel(fee: number): string {
  return Number.isInteger(fee) ? `$${fee}` : `$${fee.toFixed(2)}`;
}

/** "Tuesday, October 20" for a YYYY-MM-DD date. */
export function formatLongDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Zone 5 line for a run that is going out (threshold met, or a delivery run already due). */
export const ROUTE_CONFIRMED_LINE = 'Your Extended Reach route is confirmed.';

/** "Extended Reach begins Wednesday, November 4. We'll message you." (or coming soon, before it's set) */
export function extendedReachStartLine(reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string {
  return reach.firstRunDate
    ? `Extended Reach begins ${formatLongDate(reach.firstRunDate)}. We'll message you.`
    : "Extended Reach is coming soon. We'll message you.";
}

/** Zone 5 threshold line shown at booking and in the confirmation (client 8D). */
export function dispatchThresholdMessage(booked: number, threshold: number): string {
  return `Your route runs when ${threshold} neighbors book. Currently ${Math.min(booked, threshold)} of ${threshold}.`;
}
