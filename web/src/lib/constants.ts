// ============================================
// FIRST ELEVEN CLEANERS — Application Constants
// ============================================

// --- Brand ---
export const APP_NAME = 'First Eleven Cleaners';
export const APP_TAGLINE = 'Every Garment Makes the Lineup.';
export const PROMO_CODE_LAUNCH = 'KICKOFF15';
export const PROMO_DISCOUNT_PERCENT = 15;

// --- Support Contacts ---
export const SUPPORT_PHONE = '(682) 200-0039';
export const SUPPORT_EMAIL = 'support@firstelevencleaners.com';

// --- Pricing ---
export const WASH_FOLD_PRICE_PER_LB = 3.00;
export const WASH_FOLD_MINIMUM_LBS = 15;
export const WASH_FOLD_MINIMUM_PRICE = WASH_FOLD_PRICE_PER_LB * WASH_FOLD_MINIMUM_LBS; // $45
export const EXPRESS_SURCHARGE_PERCENT = 0.50; // +50% surcharge
export const EXPRESS_DAILY_SLOT_CAP = 8; // Default 8 slots/day capacity cap
/**
 * 24-Hour Express master switch (client 2026-10-07, 8E): OFF until the plant confirms the
 * Mon-Thu schedule in writing. This is the starting value; Mission Control's coverage
 * settings (lib/coverage-settings.ts) turn it on.
 */
export const EXPRESS_ENABLED = false;

// --- Smart Coverage Zones (client 2026-10-07, request 8) ---
// Zones 1-4 (the Metroplex) have free delivery and an order minimum. Zone 5 (Extended
// Reach) is beyond the Metroplex: a delivery fee by driving distance from the hub, a $125
// minimum, and weekly Wednesday runs (back the next Wednesday). The values here are the
// starting values; Mission Control changes minimums, route days, bands, fees, thresholds,
// the first Zone 5 run and the ZIP-to-zone table.
export type RouteDayName = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday';
export type MetroZoneId = 'zone_1' | 'zone_2' | 'zone_3' | 'zone_4';
export type ZoneId = MetroZoneId | 'zone_5';

export interface ZoneConfig {
  id: ZoneId;
  name: string;
  badge: string;
  tagline: string;
  minimumOrder: number;
  routeDays: RouteDayName[];
  routeScheduleLabel: string;
  /** Express offered in this zone (only while the Express switch is on) */
  expressEligible: boolean;
  expressLabel: string;
  /** Driving-distance band from the hub, in miles */
  minMiles: number;
  maxMiles: number;
  /** Display list for the coverage page */
  cities: string[];
  zipCodes: string[];
}

/** Every zone is measured from here (driving distance). */
export const COVERAGE_HUB = { name: 'Dry Clean City', address: '18217 Midway Rd, Dallas, TX 75287' } as const;

export const EXPRESS_BADGE = '⚡ 24-Hr Express (Mon–Thu)';
export const STANDARD_BADGE = '⏱ Standard 48-Hour (Express Unavailable)';

export const ALL_ROUTE_DAYS: RouteDayName[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SHORT_DAY: Record<RouteDayName, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
};

/** "Daily Routes (Mon–Sat)" or "Scheduled Routes (Mon & Thu)" for a set of route days. */
export function routeDaysLabel(days: readonly RouteDayName[]): string {
  if (ALL_ROUTE_DAYS.every((d) => days.includes(d))) return 'Daily Routes (Mon–Sat)';
  const ordered = ALL_ROUTE_DAYS.filter((d) => days.includes(d)).map((d) => SHORT_DAY[d]);
  if (ordered.length <= 2) return `Scheduled Routes (${ordered.join(' & ')})`;
  return `Scheduled Routes (${ordered.slice(0, -1).join(', ')} & ${ordered[ordered.length - 1]})`;
}

/** Express labels follow the switch: Zones 1-2 read "24-Hr Express (Mon–Thu)" only while it is on. */
export function zoneExpressLabel(expressEligible: boolean): string {
  return expressEligible ? EXPRESS_BADGE : STANDARD_BADGE;
}

/** Which zones may offer Express once the switch is on. */
export const ZONE_EXPRESS_ELIGIBLE: Record<MetroZoneId, boolean> = {
  zone_1: true,
  zone_2: true,
  zone_3: false,
  zone_4: false,
};

const metroZone = (
  zone: Omit<ZoneConfig, 'routeScheduleLabel' | 'expressEligible' | 'expressLabel'> & { id: MetroZoneId; routeScheduleLabel?: string }
): ZoneConfig => {
  const expressEligible = EXPRESS_ENABLED && ZONE_EXPRESS_ELIGIBLE[zone.id];
  return {
    ...zone,
    routeScheduleLabel: zone.routeScheduleLabel ?? routeDaysLabel(zone.routeDays),
    expressEligible,
    expressLabel: zoneExpressLabel(expressEligible),
  };
};

// Zone lists rebuilt from the distance bands (client 2026-10-07, revised): a zone is a route
// corridor measured from the hub, and its minimum is the cost-per-stop proxy. These ZIP lists
// are the starting values; Mission Control edits the ZIP-to-zone table.
export const ZONE_CONFIG: Record<MetroZoneId, ZoneConfig> = {
  zone_1: metroZone({
    id: 'zone_1',
    name: 'Zone 1 — North Core',
    badge: 'North Core',
    tagline: 'North Dallas, Plano, Frisco, Richardson, Lewisville & the Park Cities',
    minimumOrder: 45.00,
    routeDays: ALL_ROUTE_DAYS,
    minMiles: 0,
    maxMiles: 15,
    cities: [
      'Addison',
      'Carrollton',
      'Farmers Branch',
      'Plano',
      'Frisco',
      'Richardson',
      'The Colony',
      'Lewisville',
      'Flower Mound',
      'Coppell',
      'Preston Hollow',
      'North Dallas',
      'Highland Park',
      'University Park',
    ],
    zipCodes: [
      // Addison, Carrollton, Farmers Branch
      '75001', '75006', '75007', '75010', '75234', '75244',
      // Plano, Frisco
      '75023', '75024', '75025', '75074', '75075', '75093', '75094', '75033', '75034', '75035', '75036',
      // Richardson
      '75080', '75081', '75082',
      // The Colony, Lewisville, Flower Mound, Coppell
      '75056', '75057', '75067', '75077', '75022', '75028', '75019',
      // Preston Hollow, North Dallas (the hub's own area)
      '75220', '75225', '75229', '75230', '75240', '75243', '75248', '75251', '75252', '75254', '75287',
      // Highland Park, University Park
      '75205', '75209',
    ],
  }),
  zone_2: metroZone({
    id: 'zone_2',
    name: 'Zone 2 — Dallas Central & Mid-Cities',
    badge: 'Central & Mid-Cities',
    tagline: 'Uptown, Downtown, East Dallas, Las Colinas, Allen, McKinney and the Grapevine corridor',
    minimumOrder: 60.00,
    routeDays: ALL_ROUTE_DAYS,
    routeScheduleLabel: 'Daily & Alternating Routes (Mon–Sat)',
    minMiles: 15,
    maxMiles: 25,
    cities: [
      'Uptown & Victory Park',
      'Downtown Dallas',
      'Oak Lawn & Turtle Creek',
      'Design District',
      'Lakewood & East Dallas',
      'Kessler Park & Bishop Arts',
      'Irving & Las Colinas',
      'Allen',
      'McKinney & Craig Ranch',
      'Prosper',
      'Grapevine',
      'Southlake',
      'Colleyville',
      'Euless',
    ],
    zipCodes: [
      // Uptown, Victory Park, Downtown, Deep Ellum, Oak Lawn, Turtle Creek, Design District
      '75201', '75202', '75204', '75219', '75226', '75207', '75235',
      // Lakewood & East Dallas, Kessler Park & Bishop Arts
      '75206', '75214', '75218', '75208',
      // Irving & Las Colinas
      '75038', '75039', '75060', '75061', '75062', '75063',
      // Allen, McKinney & Craig Ranch, Prosper
      '75002', '75013', '75069', '75070', '75071', '75072', '75078',
      // Grapevine, Southlake, Colleyville, Euless
      '76051', '76092', '76034', '76039', '76040',
    ],
  }),
  zone_3: metroZone({
    id: 'zone_3',
    name: 'Zone 3 — Outer Ring',
    badge: 'Outer Ring',
    tagline: 'Arlington, Grand Prairie, the Mid-Cities, Denton, Rockwall & Forney',
    minimumOrder: 80.00,
    routeDays: ['Monday', 'Thursday'],
    minMiles: 25,
    maxMiles: 35,
    cities: [
      'Bedford',
      'Hurst',
      'Keller',
      'Westlake',
      'Grand Prairie',
      'Arlington & Entertainment District',
      'Denton',
      'Rockwall & Heath',
      'Forney',
    ],
    zipCodes: [
      // Bedford, Hurst, Keller, Westlake
      '76021', '76022', '76053', '76054', '76244', '76248', '76262',
      // Grand Prairie, Arlington
      '75050', '75051', '75052', '76006', '76010', '76011', '76012', '76013', '76015', '76016', '76017', '76018',
      // Denton
      '76201', '76202', '76203', '76204', '76205', '76207', '76208', '76209', '76210',
      // Rockwall & Heath, Forney
      '75032', '75087', '75126',
    ],
  }),
  zone_4: metroZone({
    id: 'zone_4',
    name: 'Zone 4 — Far Metroplex',
    badge: 'Far Metroplex',
    tagline: 'Fort Worth & Mansfield',
    minimumOrder: 100.00,
    routeDays: ['Tuesday', 'Friday'],
    minMiles: 35,
    maxMiles: 45,
    cities: [
      'Downtown Fort Worth',
      'Fort Worth Cultural District',
      'Mansfield',
    ],
    zipCodes: [
      // Downtown Fort Worth, the Cultural District and central Fort Worth
      '76102', '76104', '76107', '76109', '76110', '76116',
      // Mansfield
      '76063',
    ],
  }),
};

export const ZONES_LIST = Object.values(ZONE_CONFIG);

// --- Zone 5: Extended Reach (client 2026-10-07, revised) ---
export interface ExtendedReachBand {
  id: 'A' | 'B';
  /** Driving miles from the hub: above minMiles, up to and including maxMiles */
  minMiles: number;
  maxMiles: number;
  /** Extended Reach delivery fee, in dollars (taxed like any line) */
  fee: number;
  /** New pickups for a run are accepted once this many are booked (or a delivery is due that day) */
  dispatchThreshold: number;
}

export interface ExtendedReachConfig {
  /** Order minimum (garments; the delivery fee is on top) */
  minimumOrder: number;
  /** Routine members' discount on the delivery fee */
  routineDiscountPercent: number;
  /** Beyond this many miles: no booking, the waitlist instead */
  waitlistBeyondMiles: number;
  /** Runs every N weeks on routeDay (weekly: clothes come back on the next run, 7 days) */
  cadenceWeeks: number;
  routeDay: RouteDayName;
  /**
   * The first run (YYYY-MM-DD), set in Mission Control once launch day is picked. Until it is
   * set, Zone 5 addresses join the waitlist ("Extended Reach is coming soon").
   */
  firstRunDate: string | null;
  /** Booking closes this many days before a run (the run is decided 2 days before) */
  bookingNoticeDays: number;
  bands: ExtendedReachBand[];
}

export const EXTENDED_REACH_DEFAULTS: ExtendedReachConfig = {
  minimumOrder: 125,
  routineDiscountPercent: 50,
  waitlistBeyondMiles: 80,
  cadenceWeeks: 1,
  routeDay: 'Wednesday',
  firstRunDate: null,
  bookingNoticeDays: 3,
  bands: [
    { id: 'A', minMiles: 45, maxMiles: 60, fee: 35, dispatchThreshold: 3 },
    { id: 'B', minMiles: 60, maxMiles: 80, fee: 60, dispatchThreshold: 4 },
  ],
};

export const EXTENDED_REACH_LABEL = 'Extended Reach delivery';

/** Display lists per band (the client's reading of the distance table) */
export const EXTENDED_REACH_BAND_CITIES: Record<ExtendedReachBand['id'], string[]> = {
  A: ['Burleson', 'Waxahachie', 'Greenville', 'Sherman'],
  B: ['Denison', 'Weatherford', 'Corsicana', 'Gainesville'],
};

/**
 * Approximate driving miles from the hub for the Zone 5 display towns. Used ONLY when the
 * routing service can't be reached (or isn't set up locally), so these towns still resolve.
 */
export const EXTENDED_REACH_FALLBACK_MILES: Record<string, number> = {
  // Band A: Burleson, Waxahachie, Greenville, Sherman
  '76028': 50, '75165': 48, '75167': 48, '75401': 55, '75402': 55, '75090': 55, '75092': 55,
  // Band B: Denison, Weatherford, Corsicana, Gainesville
  '75020': 65, '75021': 65, '76085': 62, '76086': 62, '76087': 62, '76088': 62, '75109': 70, '75110': 70, '76240': 63,
};

/** "Extended Reach: picked up Wednesday, back the next Wednesday." (client, revised 8C) */
export function extendedReachTurnaroundLine(config: Pick<ExtendedReachConfig, 'routeDay' | 'cadenceWeeks'> = EXTENDED_REACH_DEFAULTS): string {
  return config.cadenceWeeks === 1
    ? `Extended Reach: picked up ${config.routeDay}, back the next ${config.routeDay}.`
    : `Extended Reach: picked up ${config.routeDay}, back on the next run ${config.cadenceWeeks} weeks later.`;
}

export function extendedReachZone(config: ExtendedReachConfig = EXTENDED_REACH_DEFAULTS): ZoneConfig {
  const fees = config.bands.map((b) => `$${b.fee}`).join(' / ');
  const cadence = config.cadenceWeeks === 1 ? `weekly ${config.routeDay}s` : `every ${config.cadenceWeeks} weeks on ${config.routeDay}s`;
  return {
    id: 'zone_5',
    name: `Zone 5 — Extended Reach`,
    badge: 'Extended Reach',
    tagline: `Beyond the Metroplex · delivery fee shown at booking (${fees} by distance)`,
    minimumOrder: config.minimumOrder,
    routeDays: [config.routeDay],
    routeScheduleLabel: `Extended Reach — ${cadence}`,
    expressEligible: false,
    expressLabel: STANDARD_BADGE,
    minMiles: config.bands[0]?.minMiles ?? 45,
    maxMiles: config.waitlistBeyondMiles,
    cities: [...EXTENDED_REACH_BAND_CITIES.A, ...EXTENDED_REACH_BAND_CITIES.B],
    zipCodes: Object.keys(EXTENDED_REACH_FALLBACK_MILES),
  };
}

export const EXTENDED_REACH_ZONE = extendedReachZone();

/** The Extended Reach band for a driving distance, or null (inside the Metroplex, or beyond). */
export function extendedReachBand(miles: number, config: ExtendedReachConfig = EXTENDED_REACH_DEFAULTS): ExtendedReachBand | null {
  if (!(miles > 0) || miles > config.waitlistBeyondMiles) return null;
  return config.bands.find((b) => miles > b.minMiles && miles <= b.maxMiles) ?? null;
}

/** The Extended Reach fee in dollars: Routine members get the discount (whole cents, half-up). */
export function extendedReachFee(
  band: Pick<ExtendedReachBand, 'fee'> | null,
  isRoutineMember: boolean,
  config: Pick<ExtendedReachConfig, 'routineDiscountPercent'> = EXTENDED_REACH_DEFAULTS
): number {
  if (!band) return 0;
  const cents = Math.round(band.fee * 100);
  if (!isRoutineMember) return cents / 100;
  return Math.round((cents * (100 - config.routineDiscountPercent)) / 100) / 100;
}

/**
 * Resolves the zone from the ZIP code alone (no distance): the Zone 1-4 lists, then the
 * Zone 5 towns' approximate miles, then any other North Texas ZIP (750-754, 760-762) as
 * Zone 4. Returns null outside North Texas. lib/coverage.ts uses the driving distance when
 * the routing service has one; this is its fallback and the instant first guess on screen.
 */
export function resolveZoneByZip(zip: string): ZoneConfig | null {
  const cleaned = (zip || '').trim().replace(/[^\d]/g, '');
  if (cleaned.length < 5) return null;
  const zip5 = cleaned.slice(0, 5);

  for (const zone of ZONES_LIST) {
    if (zone.zipCodes.includes(zip5)) {
      return zone;
    }
  }

  const fallbackMiles = EXTENDED_REACH_FALLBACK_MILES[zip5];
  if (fallbackMiles !== undefined) return extendedReachBand(fallbackMiles) ? EXTENDED_REACH_ZONE : null;

  // Other North Texas / DFW perimeter ZIP prefixes (750-754, 760-762), distance unknown
  const isNorthTexasPrefix = /^(75[0-4]|76[0-2])\d{2}$/.test(zip5);
  if (isNorthTexasPrefix) {
    return ZONE_CONFIG.zone_4;
  }

  // Any non-North Texas ZIP (e.g. out-of-state 24021, 90210, 10001, or 77xxx/78xxx) is outside coverage
  return null;
}

/**
 * Calculates order minimum shortfall gap for a given subtotal and zone.
 */
export function getZoneMinimumGap(subtotal: number, zone?: ZoneConfig | null): number {
  if (!zone) return 0;
  if (subtotal >= zone.minimumOrder) return 0;
  return Number((zone.minimumOrder - subtotal).toFixed(2));
}

// --- Routine member pricing (client 2026-10-08, Part 2 item 3) ---
// One rule: the plan discount applies to everything except alterations and fees. Weekly 10%
// off, Bi-Weekly 5% off, so wash & fold is $2.70/lb Weekly and $2.85/lb Bi-Weekly; the 15-lb
// floor stays. Zone 1 members' minimum is 15 lb at their member rate ($40.50 / $42.75), not
// the $45 zone minimum; Zones 2-5 keep the published minimum. Promo codes don't combine with
// member pricing.
export type PlanFrequency = 'one_time' | 'weekly' | 'biweekly';
export const ROUTINE_PLAN_DISCOUNT_PERCENT: Record<PlanFrequency, number> = { one_time: 0, weekly: 10, biweekly: 5 };
export const MEMBER_PROMO_NOT_COMBINED = "Promo codes can't be combined with Routine member pricing.";

/** Wash & fold per pound at the member rate ($2.70 Weekly, $2.85 Bi-Weekly; $3.00 one-time). */
export function memberWashFoldRate(frequency: PlanFrequency): number {
  const cents = Math.round(WASH_FOLD_PRICE_PER_LB * 100);
  return Math.round((cents * (100 - ROUTINE_PLAN_DISCOUNT_PERCENT[frequency])) / 100) / 100;
}

/** The order minimum for this customer: Zone 1 members pay 15 lb at their member rate. */
export function memberZoneMinimum(zone: Pick<ZoneConfig, 'id' | 'minimumOrder'>, frequency: PlanFrequency): number {
  if (zone.id !== 'zone_1' || frequency === 'one_time') return zone.minimumOrder;
  return Math.round(WASH_FOLD_MINIMUM_LBS * memberWashFoldRate(frequency) * 100) / 100;
}

/**
 * How far short of the minimum an order is. Zone 1 members are measured at member prices (the
 * plan discount on everything but alterations) against 15 lb at their rate; everyone else, and
 * members in Zones 2-5 ("the published zone minimum applies as-is"), as before.
 */
export function orderMinimumGap(
  subtotal: number,
  zone: ZoneConfig | null | undefined,
  frequency: PlanFrequency = 'one_time',
  alterationSubtotal = 0
): number {
  if (!zone) return 0;
  if (frequency === 'one_time' || zone.id !== 'zone_1') return getZoneMinimumGap(subtotal, zone);
  const discountable = Math.max(0, Math.round(subtotal * 100) - Math.round(alterationSubtotal * 100));
  const memberCents = Math.round(subtotal * 100) - Math.round((discountable * ROUTINE_PLAN_DISCOUNT_PERCENT[frequency]) / 100);
  const minimumCents = Math.round(memberZoneMinimum(zone, frequency) * 100);
  return memberCents >= minimumCents ? 0 : (minimumCents - memberCents) / 100;
}

// --- Taxes & Environmental Fees ---
export const TX_SALES_TAX_RATE = 0.0825; // 8.25% Texas State & Local Sales Tax
export const ENVIRONMENTAL_FEE_RATE = 0.03; // 3% Environmental Sustainability Fee
export const FAILED_PICKUP_FEE = 15.00; // $15 Failed service attempt fee

export type CatalogCategory = 'dry_clean' | 'household' | 'alteration';

/** How a customer tells the plant what to do with an alteration (client 2026-10-06) */
export type InstructionType = 'measurement' | 'match' | 'pinned' | 'amount' | 'description';

export interface CatalogItem {
  label: string;
  /** Per-piece price; for a "from" item, the starting price charged unless intake quotes more */
  price: number;
  category: CatalogCategory;
  /** Starting price: the final price can be quoted higher at intake */
  fromPrice?: boolean;
  /** Short customer-facing note shown with the item */
  note?: string;
  /** Price for every full dozen; the pieces left over never cost more than another dozen */
  dozenPrice?: number;
  /** Alterations: the fit instructions this item accepts (one is required per piece) */
  instructions?: InstructionType[];
  /** Alterations: one line with a quantity and one description for the set (buttons) */
  setWithQuantity?: boolean;
  /** Alterations: the customer may attach a photo at booking (general repair) */
  photoAllowed?: boolean;
}

/**
 * Per-piece catalog: dry cleaning and household items (price card of 2026-10-06).
 * Keys are stored on order items, so existing keys keep their meaning.
 */
export const DRY_CLEAN_PRICES: Record<string, CatalogItem> = {
  // Dry cleaning
  shirt_blouse: { label: 'Shirt (dry clean)', price: 8.99, category: 'dry_clean' },
  blouse: { label: 'Blouse', price: 8.99, category: 'dry_clean' },
  pants_skirt: { label: 'Pants / Skirt / Shorts / Vest', price: 8.99, category: 'dry_clean' },
  jeans: { label: 'Jeans', price: 10.99, category: 'dry_clean' },
  laundered_shirt: { label: 'Laundered Shirt (on hanger)', price: 4.99, category: 'dry_clean' },
  laundered_shirt_boxed: { label: 'Laundered Shirt (folded / boxed)', price: 9.99, category: 'dry_clean' },
  dress: { label: 'Dress (basic)', price: 15.99, category: 'dry_clean' },
  formal_dress: { label: 'Dress (formal)', price: 27.99, category: 'dry_clean' },
  evening_gown: { label: 'Evening Gown', price: 44.99, category: 'dry_clean', fromPrice: true },
  wedding_dress: { label: 'Wedding Dress', price: 149.99, category: 'dry_clean', fromPrice: true, note: 'Final price quoted at intake' },
  sweater: { label: 'Sweater (regular)', price: 10.99, category: 'dry_clean' },
  sweater_heavy: { label: 'Sweater (thick / heavy)', price: 13.99, category: 'dry_clean' },
  jacket: { label: 'Jacket / Coat', price: 22.99, category: 'dry_clean' },
  overcoat: { label: 'Overcoat', price: 34.99, category: 'dry_clean' },
  traditional_shirt: { label: 'Traditional / Long Shirt (agbada, kaftan, etc.)', price: 19.99, category: 'dry_clean' },
  jersey: { label: 'Jersey / Sportswear', price: 9.99, category: 'dry_clean' },
  hat: { label: 'Hat', price: 8.99, category: 'dry_clean' },
  tie_scarf: { label: 'Tie / Scarf', price: 7.99, category: 'dry_clean' },
  jumpsuit: { label: 'Jumpsuit', price: 17.99, category: 'dry_clean' },
  apron: { label: 'Apron', price: 5.99, category: 'dry_clean' },
  press_only: { label: 'Press Only', price: 5.99, category: 'dry_clean' },
  // Household
  comforter_queen: { label: 'Comforter (queen / full)', price: 39.99, category: 'household' },
  comforter_king: { label: 'Comforter (king)', price: 45.99, category: 'household' },
  comforter_down: { label: 'Comforter (down, any size)', price: 49.99, category: 'household' },
  blanket: { label: 'Blanket', price: 19.99, category: 'household' },
  pillowcase: { label: 'Pillowcase', price: 5.99, category: 'household' },
  tablecloth_small: { label: 'Tablecloth (small, up to 6 ft)', price: 24.99, category: 'household' },
  tablecloth_large: { label: 'Tablecloth (large)', price: 39.99, category: 'household' },
  napkin: { label: 'Napkin', price: 5.99, category: 'household', dozenPrice: 64.99, note: '$64.99 per dozen' },
  drapes_short: { label: 'Drapes (short panel, unlined)', price: 29.99, category: 'household', fromPrice: true, note: 'Lined drapes quoted at intake' },
  drapes_long: { label: 'Drapes (long panel, unlined)', price: 49.99, category: 'household', fromPrice: true, note: 'Lined drapes quoted at intake' },
  // Alterations (client 2026-10-06). Fixed price: bookable at the listed price. "From"
  // items: the price is confirmed after the intake photos, before any charge.
  hem_plain: { label: 'Pants hem (plain)', price: 29.99, category: 'alteration', instructions: ['measurement', 'match', 'pinned'] },
  hem_cuff: { label: 'Pants hem (with cuff)', price: 34.99, category: 'alteration', instructions: ['measurement', 'match', 'pinned'] },
  hem_jeans: { label: 'Jeans hem (original hem kept)', price: 39.99, category: 'alteration', instructions: ['measurement', 'match', 'pinned'] },
  zipper: { label: 'Pants zipper replacement', price: 35.99, category: 'alteration', instructions: ['description'], note: 'Tell us where, plus color and length if known' },
  elastic: { label: 'Elastic waistband replacement', price: 35.99, category: 'alteration', instructions: ['description'], note: 'Waistband or cuff' },
  button: { label: 'Button replacement (each)', price: 5.99, category: 'alteration', instructions: ['description'], setWithQuantity: true, note: 'Which buttons; match existing or your own buttons' },
  general_repair: { label: 'General repair / mending', price: 27.99, category: 'alteration', fromPrice: true, instructions: ['description'], photoAllowed: true, note: 'Confirmed at intake' },
  waist: { label: 'Pants waist in or out', price: 39.99, category: 'alteration', fromPrice: true, instructions: ['amount', 'pinned'], note: 'Confirmed after intake photos' },
  sleeve: { label: 'Jacket sleeve shorten', price: 49.99, category: 'alteration', fromPrice: true, instructions: ['amount', 'pinned'], note: 'Confirmed after intake photos' },
  sides: { label: 'Jacket sides in or out', price: 44.99, category: 'alteration', fromPrice: true, instructions: ['amount', 'pinned'], note: 'Confirmed after intake photos' },
};

/** Catalog entries of one category, in menu order. */
export function catalogItems(category: CatalogCategory): Array<[string, CatalogItem]> {
  return Object.entries(DRY_CLEAN_PRICES).filter(([, item]) => item.category === category);
}

/** Price shown on menus: "$44.99", or "from $44.99" for an item quoted at intake. */
export function catalogPriceLabel(item: CatalogItem): string {
  return `${item.fromPrice ? 'from ' : ''}$${item.price.toFixed(2)}`;
}

/**
 * Line total in whole cents for a quantity of one catalog item. Dozen pricing: every full
 * dozen costs the dozen price, and the pieces left over never cost more than another dozen
 * (so 11 napkins never cost more than 12).
 */
export function catalogLineCents(item: CatalogItem, quantity: number): number {
  const pieceCents = Math.round(item.price * 100);
  if (!item.dozenPrice) return pieceCents * quantity;
  const dozenCents = Math.round(item.dozenPrice * 100);
  const dozens = Math.floor(quantity / 12);
  return dozens * dozenCents + Math.min((quantity % 12) * pieceCents, dozenCents);
}

/** Line total in dollars for a catalog item key; 0 for an unknown key. */
export function catalogLineTotal(key: string, quantity: number): number {
  const item = DRY_CLEAN_PRICES[key];
  return item && quantity > 0 ? catalogLineCents(item, quantity) / 100 : 0;
}

/** Sum of catalog lines ({ key: quantity }), in dollars. */
export function catalogSubtotal(quantities: Record<string, number>): number {
  const cents = Object.entries(quantities).reduce((acc, [key, qty]) => acc + Math.round(catalogLineTotal(key, qty) * 100), 0);
  return cents / 100;
}

// --- Scheduling ---
export const PICKUP_WINDOWS = [
  { id: 'morning', label: 'Morning', start: '7:30 AM', end: '10:00 AM' },
  { id: 'evening', label: 'Evening', start: '5:00 PM', end: '8:00 PM' },
] as const;

export const OPERATING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const DAY_OFF = 'Sunday';
export const PROCESSING_HOURS = 48; // 48-Hour Match-Ready Guarantee

// --- Order Statuses (The 6 Messages) ---
export const ORDER_STATUSES = [
  { key: 'booked', label: 'Booked', icon: '📋', color: 'var(--color-status-booked)', message: 'Your pickup is confirmed.' },
  { key: 'picked_up', label: 'Picked Up', icon: '🚐', color: 'var(--color-status-picked-up)', message: 'We\'ve got your clothes!' },
  { key: 'weighed_itemized', label: 'Weighed & Itemized', icon: '⚖️', color: 'var(--color-status-weighed)', message: 'Your order is itemized.' },
  { key: 'in_cleaning', label: 'In Cleaning', icon: '✨', color: 'var(--color-status-cleaning)', message: 'Your garments are being cleaned with care.' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚', color: 'var(--color-status-out-for-delivery)', message: 'Your clothes are on the way!' },
  { key: 'delivered', label: 'Delivered', icon: '✅', color: 'var(--color-status-delivered)', message: 'Delivered! Fresh. Pressed. Game-ready.' },
  { key: 'cancelled', label: 'Cancelled', icon: '❌', color: 'var(--color-error)', message: 'Your pickup has been cancelled.' },
] as const;

export type OrderStatusKey = typeof ORDER_STATUSES[number]['key'];

export const ORDER_STATUS_MAP = Object.fromEntries(
  ORDER_STATUSES.map((s) => [s.key, s])
) as Record<OrderStatusKey, (typeof ORDER_STATUSES)[number]>;

// --- Service Types ---
export type ServiceTypeKey = 'dry_clean' | 'wash_fold' | 'mixed';

export const EXPRESS_EXCLUDED_GARMENTS = [
  'leather',
  'suede',
  'formalwear',
  'formal_dress',
  'evening_gown',
  'wedding_dress',
  'beaded_embellished',
  'stain_remediation',
] as const;

/** Specialty garments, every household item and every alteration need the full care timeline: no Express online. */
export function isExpressExcluded(garmentType: string): boolean {
  const category = DRY_CLEAN_PRICES[garmentType]?.category;
  return (
    (EXPRESS_EXCLUDED_GARMENTS as readonly string[]).includes(garmentType) ||
    category === 'household' ||
    category === 'alteration'
  );
}

// --- Routes ---
export const ROUTES = {
  home: '/',
  about: '/about',
  pricing: '/pricing',
  book: '/book',
  login: '/login',
  signup: '/signup',
  resetPassword: '/reset-password',
  authConfirm: '/auth/confirm',
  dashboard: '/dashboard',
  orders: '/dashboard/orders',
  orderDetail: (id: string) => `/dashboard/orders/${id}`,
  preferences: '/dashboard/preferences',
  addresses: '/dashboard/addresses',
  profile: '/dashboard/profile',
  billing: '/dashboard/billing',
  track: (id: string) => `/track/${id}`,
  claim: (id: string) => `/claim/${id}`,
  commercial: '/commercial',
  portal: '/portal',
  admin: '/admin',
  missionControl: '/mission-control',
  intake: '/mission-control/intake',
  staffDriver: '/staff/driver',
  privacy: '/privacy',
  terms: '/terms',
  serviceAreas: '/service-areas',
} as const;

// --- Legal & Compliance ---
export const LEGAL_CONFIG = {
  governingState: 'Texas',
  jurisdiction: 'Dallas County, Texas',
  claimsReportingWindowDays: 7,
  maxLiabilityMultiplier: 10,
  contactEmail: 'legal@firstelevencleaners.com',
  privacyEmail: 'privacy@firstelevencleaners.com',
} as const;

/**
 * Common order financial breakdown calculation across booking, pricing calculator, and receipts.
 */
export interface OrderFinancials {
  subtotal: number;
  expressSurcharge: number;
  discountAmount: number;
  frequencyDiscount: number;
  frequencyDiscountPercent: number;
  promoDiscount: number;
  promoDiscountPercent: number;
  /** Zone 5 Extended Reach delivery fee (after the Routine discount); taxed like any line */
  extendedReachFee: number;
  netSubtotal: number;
  environmentalFee: number;
  taxableAmount: number;
  salesTax: number;
  finalTotal: number;
  total: number;
}

// --- Money in whole cents (PR-27) ---
// Amounts are converted to integer cents, rates are applied with integer arithmetic, and
// half-cents round up (standard sales-tax rounding). Results are returned in dollars.
const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;
/** cents × (numerator / denominator), rounded half-up to whole cents */
const applyRate = (amountCents: number, numerator: number, denominator: number) =>
  Math.round((amountCents * numerator) / denominator);

const EXPRESS_PERCENT = Math.round(EXPRESS_SURCHARGE_PERCENT * 100); // 50
const ENV_FEE_BASIS_POINTS = Math.round(ENVIRONMENTAL_FEE_RATE * 10000); // 300
const SALES_TAX_BASIS_POINTS = Math.round(TX_SALES_TAX_RATE * 10000); // 825

/**
 * Calculates 24-Hour Express Surcharge: +50% of the subtotal. There is no separate dollar
 * floor: every order already meets its zone's order minimum.
 */
export function calculateExpressSurcharge(subtotal: number, isExpress: boolean): number {
  const subtotalCents = toCents(subtotal);
  if (!isExpress || subtotalCents <= 0) return 0;
  return toDollars(applyRate(subtotalCents, EXPRESS_PERCENT, 100));
}

/** The environmental fee and sales tax charged on a net amount, in whole cents (PR-27). */
export function feeAndTaxOn(netAmount: number): { environmentalFee: number; salesTax: number } {
  const netCents = toCents(netAmount);
  const feeCents = applyRate(netCents, ENV_FEE_BASIS_POINTS, 10000);
  const taxCents = applyRate(netCents + feeCents, SALES_TAX_BASIS_POINTS, 10000);
  return { environmentalFee: toDollars(feeCents), salesTax: toDollars(taxCents) };
}

export function calculateOrderFinancials({
  subtotal,
  expressMultiplier = 0,
  isExpress = false,
  expressSurcharge: directExpressSurcharge,
  discountPercent = 0,
  discountAmount: directDiscountAmount,
  frequency = 'one_time',
  extendedReachFee = 0,
  alterationSubtotal = 0,
}: {
  subtotal: number;
  expressMultiplier?: number;
  isExpress?: boolean;
  expressSurcharge?: number;
  discountPercent?: number;
  discountAmount?: number;
  frequency?: 'one_time' | 'weekly' | 'biweekly';
  /** Zone 5 delivery fee in dollars: no discount applies to it; fee and tax do (client 8C) */
  extendedReachFee?: number;
  /** Alterations in the subtotal: the Routine plan discount doesn't apply to them (2026-10-08) */
  alterationSubtotal?: number;
}): OrderFinancials {
  const subtotalCents = toCents(subtotal);

  let expressCents = 0;
  if (directExpressSurcharge !== undefined) {
    expressCents = toCents(directExpressSurcharge);
  } else if (isExpress) {
    expressCents = toCents(calculateExpressSurcharge(subtotal, true));
  } else if (expressMultiplier > 0) {
    expressCents = Math.round(subtotalCents * expressMultiplier);
  }
  const grossCents = subtotalCents + expressCents;

  // Routine plan discount: 10% Weekly, 5% Bi-Weekly, on everything except alterations and
  // fees (client 2026-10-08)
  const frequencyDiscountPercent = ROUTINE_PLAN_DISCOUNT_PERCENT[frequency] ?? 0;
  const discountableCents = Math.max(0, subtotalCents - toCents(alterationSubtotal));
  const frequencyCents = applyRate(discountableCents, frequencyDiscountPercent, 100);

  // Promotional or direct discount
  const promoDiscountPercent = discountPercent;
  const promoCents = directDiscountAmount !== undefined
    ? toCents(directDiscountAmount)
    : Math.round((grossCents * promoDiscountPercent) / 100);

  const totalDiscountCents = frequencyCents + promoCents;
  const deliveryCents = Math.max(0, toCents(extendedReachFee));
  const netCents = Math.max(0, grossCents - totalDiscountCents) + deliveryCents;
  const feeCents = applyRate(netCents, ENV_FEE_BASIS_POINTS, 10000);
  const taxableCents = netCents + feeCents;
  const taxCents = applyRate(taxableCents, SALES_TAX_BASIS_POINTS, 10000);
  const finalCents = netCents + feeCents + taxCents;

  return {
    subtotal: toDollars(subtotalCents),
    expressSurcharge: toDollars(expressCents),
    discountAmount: toDollars(totalDiscountCents),
    frequencyDiscount: toDollars(frequencyCents),
    frequencyDiscountPercent,
    promoDiscount: toDollars(promoCents),
    promoDiscountPercent,
    extendedReachFee: toDollars(deliveryCents),
    netSubtotal: toDollars(netCents),
    environmentalFee: toDollars(feeCents),
    taxableAmount: toDollars(taxableCents),
    salesTax: toDollars(taxCents),
    finalTotal: toDollars(finalCents),
    total: toDollars(finalCents),
  };
}

export interface BookingItemInput {
  garment_type: string;
  quantity: number;
}

export interface RecomputedBookingPricing {
  subtotal: number;
  dryCleanSubtotal: number;
  washFoldSubtotal: number;
  /** Alterations: not part of the Routine plan discount */
  alterationSubtotal: number;
  itemizedList: Array<{
    garment_type: string;
    service_type: 'dry_clean' | 'wash_fold' | 'alteration';
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes?: string;
    /** Alterations: the fit instruction (stored in order_items.details) */
    details?: Record<string, unknown>;
    /** "from" items start 'pending': the price is confirmed at intake */
    quote_status?: 'none' | 'pending';
  }>;
  financials: OrderFinancials;
}

/**
 * Server-side authoritative calculation of booking subtotal and financial breakdown.
 * Prevents client-side price tampering (F006) and ensures accurate itemization.
 */
export function computeBookingFinancials({
  dryCleanItems = [],
  alterationItems = [],
  weightLbs = 0,
  isExpress = false,
  promoDiscountPercent = 0,
  promoDiscountAmount,
  frequency = 'one_time',
  extendedReachFee = 0,
}: {
  dryCleanItems?: BookingItemInput[];
  /** One line per alteration piece (buttons: one line with a quantity), already validated */
  alterationItems?: Array<BookingItemInput & { details?: Record<string, unknown>; notes?: string }>;
  weightLbs?: number;
  isExpress?: boolean;
  promoDiscountPercent?: number;
  /** Fixed-dollar promo (discount_type 'fixed'); takes precedence over the percentage (SEC-15) */
  promoDiscountAmount?: number;
  frequency?: 'one_time' | 'weekly' | 'biweekly';
  /** Zone 5 Extended Reach delivery fee, already discounted for Routine members */
  extendedReachFee?: number;
}): RecomputedBookingPricing {
  let washFoldSubtotal = 0;
  const itemizedList: RecomputedBookingPricing['itemizedList'] = [];

  if (weightLbs > 0) {
    washFoldSubtotal = weightLbs < WASH_FOLD_MINIMUM_LBS
      ? WASH_FOLD_MINIMUM_PRICE
      : toDollars(Math.round(weightLbs * toCents(WASH_FOLD_PRICE_PER_LB)));

    itemizedList.push({
      garment_type: 'wash_fold',
      service_type: 'wash_fold',
      quantity: 1,
      unit_price: WASH_FOLD_PRICE_PER_LB,
      subtotal: washFoldSubtotal,
      notes: `${weightLbs} lbs wash & fold laundry`,
    });
  }

  let dryCleanCents = 0;
  for (const item of dryCleanItems) {
    const priceMeta = DRY_CLEAN_PRICES[item.garment_type];
    if (priceMeta && item.quantity > 0) {
      const lineCents = catalogLineCents(priceMeta, item.quantity);
      const lineTotal = toDollars(lineCents);
      dryCleanCents += lineCents;
      itemizedList.push({
        garment_type: item.garment_type,
        service_type: 'dry_clean',
        quantity: item.quantity,
        unit_price: priceMeta.price,
        subtotal: lineTotal,
      });
    }
  }

  for (const line of alterationItems) {
    const priceMeta = DRY_CLEAN_PRICES[line.garment_type];
    if (priceMeta?.category !== 'alteration' || line.quantity <= 0) continue;
    const lineCents = catalogLineCents(priceMeta, line.quantity);
    dryCleanCents += lineCents;
    itemizedList.push({
      garment_type: line.garment_type,
      service_type: 'alteration',
      quantity: line.quantity,
      unit_price: priceMeta.price,
      subtotal: toDollars(lineCents),
      notes: line.notes,
      details: line.details,
      quote_status: priceMeta.fromPrice ? 'pending' : 'none',
    });
  }

  const dryCleanSubtotal = toDollars(dryCleanCents);
  const subtotal = toDollars(toCents(washFoldSubtotal) + dryCleanCents);
  const alterationSubtotal = toDollars(itemizedList.filter((i) => i.service_type === 'alteration').reduce((sum, i) => sum + toCents(i.subtotal), 0));
  const financials = calculateOrderFinancials({
    subtotal,
    isExpress,
    discountPercent: promoDiscountPercent,
    discountAmount: promoDiscountAmount,
    frequency,
    extendedReachFee,
    alterationSubtotal,
  });

  return {
    subtotal,
    dryCleanSubtotal,
    washFoldSubtotal,
    alterationSubtotal,
    itemizedList,
    financials,
  };
}

/**
 * Resolves the application base URL dynamically across local and Vercel environments.
 * Prioritizes explicitly configured NEXT_PUBLIC_APP_URL, then automatically
 * resolves Vercel production and preview deployment URLs, falling back to localhost.
 */
export function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://www.firstelevencleaners.com';
  }
  return 'http://localhost:3000';
}

