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

// --- Zone ---
export interface Zone {
  id: string;
  name: string;
  minimum_order?: number;
  service_days: string[]; // e.g., ['Monday', 'Wednesday', 'Friday']
  route_days?: string[];
  express_eligible?: boolean;
  zip_codes?: string[];
  is_active: boolean;
  created_at: string;
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
export interface OrderItem {
  id: string;
  order_id: string;
  garment_type: string;
  service_type: 'dry_clean' | 'wash_fold';
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes: string | null;
}

// --- Order Event (Status Timeline) ---
export interface OrderEvent {
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
  photo_type: 'intake' | 'return' | 'delivery_proof' | 'pickup_proof';
  photo_url: string;
  condition_notes: string | null;
  captured_by: string | null;
  captured_at: string;
}

// --- Time Slot ---
export interface TimeSlot {
  id: string;
  date: string;
  window: 'morning' | 'evening';
  capacity: number;
  booked_count: number;
  is_available: boolean;
  zone_id: string | null;
}

// --- Promo Code ---
export interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

// --- Commercial Account ---
export interface CommercialAccount {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  billing_email: string;
  rate_card_id: string | null;
  payment_terms: string;
  created_at: string;
}

// --- Staff ---
export interface Staff {
  id: string;
  name: string;
  role: 'admin' | 'driver' | 'intake_staff';
  email: string;
  phone: string | null;
  is_active: boolean;
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

// --- Booking Form ---
export interface BookingFormData {
  address: {
    street: string;
    unit: string;
    city: string;
    state: string;
    zip: string;
    delivery_notes: string;
    saved_address_id?: string;
  };
  services: {
    type: ServiceTypeKey;
    dry_clean_items: Array<{ garment_type: string; quantity: number }>;
    estimated_weight_lbs: number;
  };
  schedule: {
    pickup_date: string;
    pickup_window: 'morning' | 'evening';
    express_tier: 'standard' | 'express_24hr';
  };
  promo_code: string;
  zone?: ZoneConfig;
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
