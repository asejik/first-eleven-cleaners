// ============================================
// FIRST ELEVEN CLEANERS — Application Constants
// ============================================

// --- Brand ---
export const APP_NAME = 'First Eleven Cleaners';
export const APP_TAGLINE = 'Born on the world\'s biggest stage. Now serving yours.';
export const APP_DESCRIPTION = 'Premium AI-augmented dry cleaning and laundry pickup & delivery across the Dallas-Fort Worth Metroplex.';
export const PROMO_CODE_LAUNCH = 'KICKOFF15';
export const PROMO_DISCOUNT_PERCENT = 15;

// --- Pricing ---
export const WASH_FOLD_PRICE_PER_LB = 3.00;
export const WASH_FOLD_MINIMUM_LBS = 15;
export const WASH_FOLD_MINIMUM_PRICE = WASH_FOLD_PRICE_PER_LB * WASH_FOLD_MINIMUM_LBS; // $45
export const EXPRESS_8HR_SURCHARGE = 0.25; // +25%
export const EXPRESS_4HR_SURCHARGE = 0.40; // +40%
export const EXPRESS_ENABLED = false; // Toggle on when plant confirms capacity

export const DRY_CLEAN_PRICES: Record<string, { label: string; price: number }> = {
  shirt_blouse: { label: 'Shirt / Blouse (dry clean)', price: 8.97 },
  laundered_shirt: { label: 'Laundered Shirt', price: 4.47 },
  pants_skirt: { label: 'Pants / Skirt / Shorts / Vest', price: 8.97 },
  dress: { label: 'Dress', price: 14.97 },
  tie_scarf: { label: 'Tie / Scarf', price: 7.77 },
  sweater: { label: 'Sweater', price: 11.97 },
  jacket: { label: 'Jacket', price: 14.97 },
  overcoat: { label: 'Overcoat', price: 20.97 },
  jumpsuit: { label: 'Jumpsuit', price: 17.97 },
  formal_dress: { label: 'Formal Dress', price: 23.97 },
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
] as const;

export type OrderStatusKey = typeof ORDER_STATUSES[number]['key'];

export const ORDER_STATUS_MAP = Object.fromEntries(
  ORDER_STATUSES.map((s) => [s.key, s])
) as Record<OrderStatusKey, (typeof ORDER_STATUSES)[number]>;

// --- Service Types ---
export const SERVICE_TYPES = [
  { key: 'dry_clean', label: 'Dry Cleaning', description: 'Professional dry cleaning for suits, dresses, and delicates.' },
  { key: 'wash_fold', label: 'Wash & Fold', description: 'Everyday laundry — washed, dried, and neatly folded.' },
  { key: 'mixed', label: 'Both', description: 'Dry cleaning + wash & fold in one pickup.' },
] as const;

export type ServiceTypeKey = typeof SERVICE_TYPES[number]['key'];

// --- Express Tiers ---
export const EXPRESS_TIERS = [
  { key: 'standard', label: 'Standard (48 hours)', surcharge: 0, enabled: true },
  { key: 'express_8hr', label: 'Express (under 8 hours)', surcharge: EXPRESS_8HR_SURCHARGE, enabled: EXPRESS_ENABLED },
  { key: 'express_4hr', label: 'Rush (under 4 hours)', surcharge: EXPRESS_4HR_SURCHARGE, enabled: EXPRESS_ENABLED },
] as const;

// --- Routes ---
export const ROUTES = {
  home: '/',
  pricing: '/pricing',
  book: '/book',
  login: '/login',
  signup: '/signup',
  dashboard: '/dashboard',
  orders: '/dashboard/orders',
  orderDetail: (id: string) => `/dashboard/orders/${id}`,
  preferences: '/dashboard/preferences',
  addresses: '/dashboard/addresses',
  profile: '/dashboard/profile',
  track: (id: string) => `/track/${id}`,
  claim: (id: string) => `/claim/${id}`,
  commercial: '/commercial',
  portal: '/portal',
  missionControl: '/mission-control',
  intake: '/mission-control/intake',
  staffDriver: '/staff/driver',
} as const;
