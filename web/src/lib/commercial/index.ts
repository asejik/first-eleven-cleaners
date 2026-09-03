import type {
  CommercialInvoice,
  CommercialRateCard,
  RecurringSchedule,
} from './types';

export * from './types';

export const COMMERCIAL_RATE_CARDS: Record<string, CommercialRateCard> = {
  rate_card_hospitality_vip: {
    id: 'rate_card_hospitality_vip',
    name: 'Luxury Hospitality & Guest Valet Tier',
    wash_fold_per_lb: 1.95,
    towel_service_per_lb: 1.75,
    suit_price: 14.5,
    shirt_price: 6.5,
    linen_sheet_price: 18.0,
    turnaround_hours: 24,
    minimum_lbs_per_pickup: 50,
  },
  rate_card_medical_sanitized: {
    id: 'rate_card_medical_sanitized',
    name: 'MedSpa Sanitized Linen & Uniform Tier',
    wash_fold_per_lb: 1.85,
    towel_service_per_lb: 1.85,
    suit_price: 15.0,
    shirt_price: 7.0,
    linen_sheet_price: 16.0,
    turnaround_hours: 24,
    minimum_lbs_per_pickup: 30,
  },
  rate_card_fitness_volume: {
    id: 'rate_card_fitness_volume',
    name: 'High-Volume Athletic & Towel Tier',
    wash_fold_per_lb: 1.65,
    towel_service_per_lb: 1.65,
    suit_price: 16.0,
    shirt_price: 7.5,
    linen_sheet_price: 20.0,
    turnaround_hours: 12,
    minimum_lbs_per_pickup: 75,
  },
};

export const SAMPLE_RECURRING_SCHEDULES: Record<string, RecurringSchedule> = {
  'c1111111-1111-4111-a111-111111111111': {
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    pickup_window: 'morning',
    service_type: 'mixed',
    delivery_notes: 'Dock loading bay on Commerce St. Ring concierge bell.',
  },
  'c2222222-2222-4222-a222-222222222222': {
    days: ['Monday', 'Wednesday', 'Friday'],
    pickup_window: 'morning',
    service_type: 'linen_towel',
    delivery_notes: 'Rear clinic entrance. Leave fresh bags in Sterilization Annex.',
  },
  'c3333333-3333-4333-a333-333333333333': {
    days: ['Daily (7 Days/Wk)'],
    pickup_window: 'evening',
    service_type: 'linen_towel',
    delivery_notes: 'Athletic hamper cage near laundry drop chute.',
  },
};

export const SAMPLE_INVOICES: CommercialInvoice[] = [
  {
    id: 'inv-2026-0801',
    account_id: 'c1111111-1111-4111-a111-111111111111',
    business_name: 'The Joule Hotel Dallas',
    invoice_number: 'INV-F11-2026-0801',
    billing_period: 'August 1 – August 15, 2026',
    issue_date: '2026-08-16',
    due_date: '2026-09-15',
    total_weight_lbs: 1240,
    total_items: 84,
    subtotal: 2786.0,
    tax: 229.85,
    total: 3015.85,
    status: 'paid',
    items: [
      { description: 'Hotel Guest Linen & Towel Bulk Service', quantity: 1240, unit: 'lbs', unit_price: 1.75, total: 2170.0 },
      { description: 'VIP Guest Valet 2-Piece Suits', quantity: 28, unit: 'items', unit_price: 14.5, total: 406.0 },
      { description: 'Executive Dress Shirts Pressed', quantity: 32, unit: 'items', unit_price: 6.5, total: 208.0 },
      { description: 'Boutique Duvet & Bedding Sets', quantity: 2, unit: 'items', unit_price: 1.0, total: 2.0 },
    ],
  },
  {
    id: 'inv-2026-0802',
    account_id: 'c1111111-1111-4111-a111-111111111111',
    business_name: 'The Joule Hotel Dallas',
    invoice_number: 'INV-F11-2026-0802',
    billing_period: 'August 16 – August 31, 2026',
    issue_date: '2026-09-01',
    due_date: '2026-10-01',
    total_weight_lbs: 1480,
    total_items: 96,
    subtotal: 3342.0,
    tax: 275.72,
    total: 3617.72,
    status: 'pending',
    items: [
      { description: 'Hotel Guest Linen & Towel Bulk Service', quantity: 1480, unit: 'lbs', unit_price: 1.75, total: 2590.0 },
      { description: 'VIP Guest Valet 2-Piece Suits', quantity: 36, unit: 'items', unit_price: 14.5, total: 522.0 },
      { description: 'Executive Dress Shirts Pressed', quantity: 35, unit: 'items', unit_price: 6.5, total: 227.5 },
      { description: 'Boutique Duvet Sets Sanitized', quantity: 1, unit: 'items', unit_price: 2.5, total: 2.5 },
    ],
  },
  {
    id: 'inv-2026-0803',
    account_id: 'c2222222-2222-4222-a222-222222222222',
    business_name: 'Highland Park MedSpa & Wellness',
    invoice_number: 'INV-F11-2026-0803',
    billing_period: 'August 1 – August 31, 2026',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    total_weight_lbs: 640,
    total_items: 42,
    subtotal: 1499.0,
    tax: 123.67,
    total: 1622.67,
    status: 'paid',
    items: [
      { description: 'Sanitized Spa Robes & Towels', quantity: 640, unit: 'lbs', unit_price: 1.85, total: 1184.0 },
      { description: 'Medical Staff Scrubs & Lab Coats', quantity: 42, unit: 'items', unit_price: 7.5, total: 315.0 },
    ],
  },
];
