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
 * Coverage rules (client 2026-10-07, request 8). Safe on the client and the server.
 *
 * - Zones 1-4 follow the ZIP lists in constants.ts (the client's display lists).
 * - Anything else is placed by DRIVING distance from the hub (lib/distance.ts): Zone 5
 *   Extended Reach in its bands (45-60 mi, 60-80 mi), the waitlist beyond 80 mi, and Zone 4
 *   for an unlisted Metroplex ZIP inside 45 mi. Without a distance, Zone 5 towns use their
 *   approximate miles and other North Texas ZIPs are Zone 4.
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
  const s = saved as Partial<{ expressEnabled: unknown; zones: Record<string, Record<string, unknown>>; extendedReach: Record<string, unknown> }>;
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
  const firstRunDate = typeof e.firstRunDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.firstRunDate) ? e.firstRunDate : de.firstRunDate;
  return {
    expressEnabled: typeof s.expressEnabled === 'boolean' ? s.expressEnabled : d.expressEnabled,
    zones,
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
    }
  /** Beyond the last band, or outside North Texas: no booking, the waitlist instead */
  | { status: 'waitlist'; miles: number | null };

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
    if (distance > reach.waitlistBeyondMiles) return { status: 'waitlist', miles: distance };
    const band = extendedReachBand(distance, reach);
    if (band) return { status: 'served', zone: coverage.extendedReachZone, miles: distance, band };
    // An unlisted Metroplex ZIP inside the bands: the outer Metroplex zone
    return { status: 'served', zone: coverage.zones.zone_4, miles: distance, band: null };
  }

  // No distance: other North Texas ZIPs (750-754, 760-762) are Zone 4, as before
  if (/^(75[0-4]|76[0-2])\d{2}$/.test(zip5)) return { status: 'served', zone: coverage.zones.zone_4, miles: null, band: null };
  return { status: 'waitlist', miles: null };
}

/** What a Zone 5 address shows the moment it resolves (from /api/coverage/resolve). */
export interface ExtendedReachQuote {
  band: 'A' | 'B';
  fullFee: number;
  routineFee: number;
  routineDiscountPercent: number;
  minimumOrder: number;
  threshold: number;
  /** The next runs this address can book, with the neighbors booked on each */
  runs: Array<{ date: string; booked: number; threshold: number; dispatched: boolean }>;
}

// --- Routine members (client 8C) -------------------------------------------------------

export type Frequency = 'one_time' | 'weekly' | 'biweekly';

/**
 * A Routine member is a customer on a recurring plan (Weekly or Bi-Weekly). "Join the Routine"
 * picks Bi-Weekly, which matches Zone 5's bi-weekly route.
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

/** True on a Zone 5 run date: the first run, then every cadenceWeeks weeks. */
export function isExtendedReachRunDate(date: string, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): boolean {
  const diff = daysBetween(reach.firstRunDate, date);
  return diff >= 0 && diff % (7 * reach.cadenceWeeks) === 0;
}

/** The next `count` Zone 5 run dates on or after this date. */
export function extendedReachRunDates(fromDate: string, count: number, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string[] {
  const period = 7 * reach.cadenceWeeks;
  const diff = daysBetween(reach.firstRunDate, fromDate);
  const steps = diff <= 0 ? 0 : Math.ceil(diff / period);
  const first = addDaysToDate(reach.firstRunDate, steps * period);
  return Array.from({ length: count }, (_, i) => addDaysToDate(first, i * period));
}

/** The earliest Zone 5 run that can still be booked (bookings close a few days before). */
export function earliestExtendedReachRun(today: string, reach: ExtendedReachConfig = DEFAULT_COVERAGE.extendedReach): string {
  return extendedReachRunDates(addDaysToDate(today, reach.bookingNoticeDays), 1, reach)[0];
}

/**
 * Delivery date for a pickup in this zone. The plant turnaround comes first (2 plant days,
 * Express 1, alterations 5); Zones 3 and 4 then deliver on their next route day (client 8B:
 * a Zone 4 Friday pickup is delivered Tuesday). Zone 5 has standard turnaround.
 */
export function zoneDeliveryDate(
  zone: ZoneConfig | null | undefined,
  pickupDate: string,
  tier: ScheduleTier = 'standard',
  { alterations = false }: { alterations?: boolean } = {},
  coverage: Coverage = DEFAULT_COVERAGE
): string {
  const ready = estimatedDeliveryDate(pickupDate, tier, { alterations });
  if (!zone || zone.id === 'zone_5' || zone.routeDays.length >= ALL_ROUTE_DAYS.length) return ready;
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

/** Zone 5 threshold line shown at booking and in the confirmation (client 8D). */
export function dispatchThresholdMessage(booked: number, threshold: number): string {
  return `Your route runs when ${threshold} neighbors book. Currently ${Math.min(booked, threshold)} of ${threshold}.`;
}
