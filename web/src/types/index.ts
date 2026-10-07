// ============================================
// FIRST ELEVEN CLEANERS — Type Definitions
// ============================================

import type { OrderStatusKey, ServiceTypeKey, ZoneConfig } from '@/lib/constants';

// --- User Roles ---
export type UserRole = 'customer' | 'driver' | 'intake_staff' | 'admin' | 'staff';

// --- Customer ---
export interface Customer {
  id: string;
  auth_id?: string;
  email: string;
  phone: string;
  full_name: string;
  role?: UserRole;
  sms_consent?: boolean;
  sms_promotions_consent?: boolean;
  sms_consent_at?: string | null;
  /** Staff screens only: the parts of the customer's Preferences that role needs (P05 AR-03) */
  preferences?: Partial<Pick<CustomerPreferences, 'gate_code' | 'delivery_instructions' | 'starch_level' | 'fold_vs_hang' | 'detergent_sensitivity'>> | null;
  created_at: string;
  updated_at: string;
}

// --- Staff Management ---
export interface StaffMember {
  id: string;
  auth_id: string;
  email: string;
  phone: string;
  full_name: string;
  role: 'admin' | 'driver' | 'intake_staff';
  is_active: boolean;
  created_at: string;
  last_sign_in_at?: string | null;
}

export interface CreateStaffPayload {
  full_name: string;
  email: string;
  phone: string;
  role: 'driver' | 'intake_staff';
  password?: string;
}

export interface UpdateStaffPayload {
  full_name?: string;
  phone?: string;
  role?: 'driver' | 'intake_staff';
  is_active?: boolean;
  password?: string;
}

export interface CustomerPreferences {
  customer_id: string;
  starch_level: 'none' | 'light' | 'medium' | 'heavy';
  fold_vs_hang: 'fold' | 'hang';
  detergent_sensitivity: string | null;
  gate_code: string | null;
  delivery_instructions: string | null;
  special_notes: string | null;
}

// --- Address ---
export interface Address {
  id: string;
  customer_id: string;
  street: string;
  unit: string | null;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  delivery_notes: string | null;
  zone_id: string | null;
  zone?: ZoneConfig;
}

// --- Order ---
export interface Order {
  id: string;
  order_number?: string;
  customer_id: string;
  address_id: string;
  status: OrderStatusKey;
  order_type: ServiceTypeKey;
  pickup_date: string;
  pickup_window: 'morning' | 'evening';
  delivery_date: string | null;
  delivery_window: 'morning' | 'evening' | null;
  weight_lbs: number | null;
  subtotal: number;
  express_tier: 'standard' | 'express_24hr';
  express_surcharge?: number;
  express_auto_refunded?: boolean;
  express_refund_amount?: number;
  express_refund_reason?: string;
  promo_code: string | null;
  discount_amount: number;
  total: number;
  payment_id: string | null;
  payment_status: 'pending' | 'authorized' | 'charged' | 'failed' | 'refunded';
  /** Public tracking view only: order is on Payment Hold, and the amount the link holder can pay (PR-04) */
  payment_hold?: boolean;
  amount_due?: number;
  /** Public tracking: the card hold was declined before pickup and a new card is needed (Part A) */
  card_needed?: boolean;
  /** Public tracking, once itemized: the ticket lines and amounts charged (Part A) */
  ticket?: {
    items: Array<{
      id?: string;
      garment_type: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
      quote_status?: string;
      quoted_unit_price?: number | null;
      notes?: string | null;
    }>;
    subtotal: number;
    express_surcharge?: number | null;
    discount_amount?: number | null;
    environmental_fee?: number | null;
    sales_tax?: number | null;
    total: number;
  };
  hold_amount?: number | null;
  /** Card hold and Payment Needed ladder (Mission Control, Part A) */
  hold_status?: string | null;
  hold_expires_at?: string | null;
  payment_needed_since?: string | null;
  payment_reminder_stage?: number | null;
  notes: string | null;
  frequency?: 'one_time' | 'weekly' | 'biweekly';
  created_at: string;
  updated_at: string;
  // Joined relations (optional)
  customer?: Customer;
  address?: Address;
  items?: OrderItem[];
  events?: OrderEvent[];
  photos?: GarmentPhoto[];
}

// --- Order Item ---
interface OrderItem {
  id: string;
  order_id: string;
  garment_type: string;
  service_type: 'dry_clean' | 'wash_fold' | 'alteration';
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
  /** Alterations: the fit instruction ({ instruction, notes }) */
  details?: { instruction?: { type: string }; notes?: string } | null;
  /** "from" items: none | pending | within_band | awaiting_approval | approved | declined | returned */
  quote_status?: string;
  quoted_unit_price?: number | null;
  quote_requested_at?: string | null;
  quote_reminder_stage?: number;
}

// --- Order Event (Status Timeline) ---
interface OrderEvent {
  id: string;
  order_id: string;
  status: OrderStatusKey;
  timestamp: string;
  note: string | null;
  triggered_by: string | null; // staff ID or 'system'
}

// --- Garment Photo ---
export interface GarmentPhoto {
  id: string;
  order_id: string;
  order_item_id: string | null;
  photo_type: 'intake' | 'return' | 'delivery_proof' | 'pickup_proof' | 'customer_reference';
  photo_url: string;
  condition_notes: string | null;
  captured_by: string | null;
  captured_at: string;
}

// --- Claim (Make It Right) ---
export interface Claim {
  id: string;
  order_id: string;
  customer_id: string;
  issue_type: 'missing_item' | 'garment_damage' | 'quality_issue' | 'delivery_issue' | 'other' | string;
  description: string;
  photo_urls: string[];
  status: 'open' | 'investigating' | 'resolved' | 'refunded' | 'closed';
  resolution_notes: string | null;
  refund_amount?: number | null;
  created_at: string;
  updated_at: string;
  order?: Order;
  customer?: Customer;
}

// --- Price Calculation Result ---
export interface PriceCalculation {
  dry_clean_subtotal: number;
  wash_fold_subtotal: number;
  subtotal: number;
  express_surcharge: number;
  discount_amount: number;
  total: number;
  weight_lbs: number;
  meets_minimum: boolean;
  minimum_shortfall: number;
  zone?: ZoneConfig | null;
  zone_minimum_shortfall?: number;
  items: Array<{ label: string; quantity: number; unit_price: number; subtotal: number }>;
}

// --- Booking Submission Payload & Result ---
export interface BookingSubmissionPayload {
  /** One per checkout; a resubmit returns the first order (PR-11) */
  idempotency_key?: string;
  customer: {
    full_name: string;
    email: string;
    phone: string;
  };
  address: {
    street: string;
    unit?: string;
    city?: string;
    state?: string;
    zip: string;
    delivery_notes?: string;
  };
  services: {
    type: ServiceTypeKey;
    dry_clean_items?: Array<{
      garment_type: string;
      quantity: number;
    }>;
    estimated_weight_lbs?: number;
  };
  schedule: {
    pickup_date: string;
    pickup_window: 'morning' | 'evening';
    express_tier?: 'standard' | 'express_24hr';
    frequency?: 'one_time' | 'weekly' | 'biweekly';
  };
  pricing: {
    subtotal: number;
    discount_amount?: number;
    total: number;
    promo_code?: string | null;
  };
  payment_method?: {
    card_brand?: string;
    last_4?: string;
    payment_token?: string | null;
  };
  consents?: {
    sms_order_updates?: boolean;
    sms_promotions?: boolean;
  };
}

export interface BookingSubmissionResult {
  success: boolean;
  order: Order;
  order_number: string;
  message: string;
}
