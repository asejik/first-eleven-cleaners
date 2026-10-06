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
export const EXPRESS_MINIMUM_SURCHARGE = 15.00; // $15.00 minimum surcharge
export const EXPRESS_DAILY_SLOT_CAP = 8; // Default 8 slots/day capacity cap
export const EXPRESS_ENABLED = true; // 24-Hour Express ("Match-Ready Tomorrow") active
// --- Smart Coverage Zones ---
export interface ZoneConfig {
  id: 'zone_1' | 'zone_2' | 'zone_3' | 'zone_4';
  name: string;
  badge: string;
  tagline: string;
  minimumOrder: number;
  routeDays: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday')[];
  routeScheduleLabel: string;
  expressEligible: boolean;
  expressLabel: string;
  cities: string[];
  zipCodes: string[];
}

export const ZONE_CONFIG: Record<ZoneConfig['id'], ZoneConfig> = {
  zone_1: {
    id: 'zone_1',
    name: 'Zone 1 — Core',
    badge: 'Core Metro',
    tagline: 'Dallas Central & Core + Mid-Cities & Las Colinas',
    minimumOrder: 45.00,
    routeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    routeScheduleLabel: 'Daily Routes (Mon–Sat)',
    expressEligible: true,
    expressLabel: '⚡ 24-Hour Express Eligible',
    cities: [
      'Downtown Dallas',
      'Uptown & Victory Park',
      'Highland Park',
      'University Park',
      'Preston Hollow',
      'Lakewood & East Dallas',
      'Oak Lawn & Turtle Creek',
      'Design District',
      'Kessler Park & Bishop Arts',
      'Irving & Las Colinas',
      'Coppell',
      'Farmers Branch',
      'Euless',
      'Bedford',
      'Hurst',
      'Grand Prairie',
    ],
    zipCodes: [
      '75201', '75202', '75204', '75205', '75206', '75207', '75208', '75209', '75214', '75219',
      '75220', '75225', '75226', '75230', '75234', '75235', '75240', '75244', '75248', '75251',
      '75038', '75039', '75060', '75061', '75062', '75063', '75019', '75006', '76039', '76040',
      '76053', '76054', '75050', '75051', '75052',
    ],
  },
  zone_2: {
    id: 'zone_2',
    name: 'Zone 2 — North Dallas Corridor',
    badge: 'North Corridor',
    tagline: 'Plano, Frisco, Richardson, Carrollton, Addison, Allen, McKinney & Prosper',
    minimumOrder: 60.00,
    routeDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    routeScheduleLabel: 'Daily & Alternating Routes (Mon–Sat)',
    expressEligible: true,
    expressLabel: '⚡ 24-Hour Express Eligible',
    cities: [
      'Plano (Legacy & West)',
      'Frisco (The Star & Hall Park)',
      'Addison',
      'Carrollton',
      'Richardson (Telecom Corridor)',
      'Allen',
      'McKinney & Craig Ranch',
      'Prosper',
    ],
    zipCodes: [
      '75001', '75007', '75010', '75013', '75023', '75024', '75025', '75093', '75033', '75034',
      '75035', '75036', '75070', '75071', '75072', '75078', '75080', '75081', '75082', '75094',
    ],
  },
  zone_3: {
    id: 'zone_3',
    name: 'Zone 3 — Tarrant & West Metro',
    badge: 'Tarrant & West',
    tagline: 'Fort Worth, Arlington, Southlake, Colleyville, Grapevine, Keller & Westlake',
    minimumOrder: 80.00,
    routeDays: ['Tuesday', 'Friday'],
    routeScheduleLabel: 'Scheduled Routes (Tue & Fri)',
    expressEligible: false,
    expressLabel: '⏱ Standard 48-Hour (Express Unavailable)',
    cities: [
      'Downtown Fort Worth',
      'Fort Worth Cultural District',
      'Arlington & Entertainment District',
      'Southlake',
      'Colleyville',
      'Grapevine',
      'Keller',
      'Westlake',
    ],
    zipCodes: [
      '76102', '76104', '76107', '76109', '76116', '76132', '76137', '76179', '76006', '76010',
      '76011', '76012', '76013', '76017', '76018', '76092', '76034', '76051', '76248', '76262',
    ],
  },
  zone_4: {
    id: 'zone_4',
    name: 'Zone 4 — Extended North Texas',
    badge: 'Extended Coverage',
    tagline: 'Wider Metroplex & Surrounding Communities',
    minimumOrder: 100.00,
    routeDays: ['Wednesday'],
    routeScheduleLabel: 'Scheduled Routes (Wednesdays)',
    expressEligible: false,
    expressLabel: '⏱ Standard 48-Hour (Express Unavailable)',
    cities: [
      'Denton',
      'Lewisville & Flower Mound',
      'Rockwall & Heath',
      'Forney',
      'Waxahachie',
      'Weatherford',
      'Burleson & Mansfield',
      'Extended North Texas Coverage',
    ],
    zipCodes: [
      // Denton, Corinth, Argyle, North Lakes
      '76201', '76202', '76203', '76204', '76205', '76207', '76208', '76209', '76210', '76226', '76227', '76249', '76258', '76259',
      // Lewisville, Flower Mound, Highland Village, The Colony
      '75022', '75028', '75056', '75057', '75067', '75077',
      // Rockwall, Heath, Royse City
      '75032', '75087', '75189',
      // Forney, Kaufman, Terrell
      '75126', '75142', '75160',
      // Waxahachie, Midlothian, Red Oak, Ennis
      '75165', '75167', '76065', '75154', '75119',
      // Weatherford, Aledo, Parker County
      '76085', '76086', '76087', '76088', '76008',
      // Burleson, Mansfield, Crowley, Joshua, Cleburne
      '76028', '76063', '76084', '76036', '76058', '76031',
      // Perimeter North Texas / DFW Communities
      '75048', '75088', '75089', '75098', '75104', '75115', '75116', '75134', '75146', '75149', '75150', '75180', '75181',
    ],
  },
};

export const ZONES_LIST = Object.values(ZONE_CONFIG);

/**
 * Resolves coverage zone by customer 5-digit ZIP code.
 * Returns null if the ZIP code is empty, incomplete, or outside our Dallas–Fort Worth service area.
 */
export function resolveZoneByZip(zip: string): ZoneConfig | null {
  const cleaned = (zip || '').trim().replace(/[^\d]/g, '');
  if (cleaned.length < 5) return null;
  const zip5 = cleaned.slice(0, 5);

  for (const zone of [ZONE_CONFIG.zone_1, ZONE_CONFIG.zone_2, ZONE_CONFIG.zone_3, ZONE_CONFIG.zone_4]) {
    if (zone.zipCodes.includes(zip5)) {
      return zone;
    }
  }

  // Fallback for valid North Texas / DFW perimeter ZIP prefixes (750-754, 760-762)
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

// --- Taxes & Environmental Fees ---
export const TX_SALES_TAX_RATE = 0.0825; // 8.25% Texas State & Local Sales Tax
export const ENVIRONMENTAL_FEE_RATE = 0.03; // 3% Environmental Sustainability Fee
export const FAILED_PICKUP_FEE = 15.00; // $15 Failed service attempt fee

export const DRY_CLEAN_PRICES: Record<string, { label: string; price: number }> = {
  shirt_blouse: { label: 'Shirt / Blouse (dry clean)', price: 8.99 },
  laundered_shirt: { label: 'Laundered Shirt', price: 4.99 },
  pants_skirt: { label: 'Pants / Skirt / Shorts / Vest', price: 8.99 },
  dress: { label: 'Dress', price: 14.99 },
  tie_scarf: { label: 'Tie / Scarf', price: 7.99 },
  sweater: { label: 'Sweater', price: 11.99 },
  jacket: { label: 'Jacket', price: 14.99 },
  overcoat: { label: 'Overcoat', price: 20.99 },
  jumpsuit: { label: 'Jumpsuit', price: 17.99 },
  formal_dress: { label: 'Formal Dress', price: 23.99 },
};

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
  'beaded_embellished',
  'stain_remediation',
] as const;

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
 * Calculates 24-Hour Express Surcharge:
 * +50% surcharge on subtotal, with a $15.00 minimum surcharge floor.
 * Subtotal of 0 incurs 0 surcharge.
 */
export function calculateExpressSurcharge(subtotal: number, isExpress: boolean): number {
  const subtotalCents = toCents(subtotal);
  if (!isExpress || subtotalCents <= 0) return 0;
  return toDollars(Math.max(applyRate(subtotalCents, EXPRESS_PERCENT, 100), toCents(EXPRESS_MINIMUM_SURCHARGE)));
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
}: {
  subtotal: number;
  expressMultiplier?: number;
  isExpress?: boolean;
  expressSurcharge?: number;
  discountPercent?: number;
  discountAmount?: number;
  frequency?: 'one_time' | 'weekly' | 'biweekly';
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

  // Recurring plan frequency discount: 10% for weekly, 5% for biweekly (F005)
  const frequencyDiscountPercent = frequency === 'weekly' ? 10 : frequency === 'biweekly' ? 5 : 0;
  const frequencyCents = applyRate(subtotalCents, frequencyDiscountPercent, 100);

  // Promotional or direct discount
  const promoDiscountPercent = discountPercent;
  const promoCents = directDiscountAmount !== undefined
    ? toCents(directDiscountAmount)
    : Math.round((grossCents * promoDiscountPercent) / 100);

  const totalDiscountCents = frequencyCents + promoCents;
  const netCents = Math.max(0, grossCents - totalDiscountCents);
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
  itemizedList: Array<{
    garment_type: string;
    service_type: 'dry_clean' | 'wash_fold';
    quantity: number;
    unit_price: number;
    subtotal: number;
    notes?: string;
  }>;
  financials: OrderFinancials;
}

/**
 * Server-side authoritative calculation of booking subtotal and financial breakdown.
 * Prevents client-side price tampering (F006) and ensures accurate itemization.
 */
export function computeBookingFinancials({
  dryCleanItems = [],
  weightLbs = 0,
  isExpress = false,
  promoDiscountPercent = 0,
  promoDiscountAmount,
  frequency = 'one_time',
}: {
  dryCleanItems?: BookingItemInput[];
  weightLbs?: number;
  isExpress?: boolean;
  promoDiscountPercent?: number;
  /** Fixed-dollar promo (discount_type 'fixed'); takes precedence over the percentage (SEC-15) */
  promoDiscountAmount?: number;
  frequency?: 'one_time' | 'weekly' | 'biweekly';
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
      const lineCents = toCents(priceMeta.price) * item.quantity;
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

  const dryCleanSubtotal = toDollars(dryCleanCents);
  const subtotal = toDollars(toCents(washFoldSubtotal) + dryCleanCents);
  const financials = calculateOrderFinancials({
    subtotal,
    isExpress,
    discountPercent: promoDiscountPercent,
    discountAmount: promoDiscountAmount,
    frequency,
  });

  return {
    subtotal,
    dryCleanSubtotal,
    washFoldSubtotal,
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

