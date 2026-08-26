export interface CommercialRateCard {
  id: string;
  name: string;
  wash_fold_per_lb: number;
  towel_service_per_lb: number;
  suit_price: number;
  shirt_price: number;
  linen_sheet_price: number;
  turnaround_hours: number;
  minimum_lbs_per_pickup: number;
}

export interface RecurringSchedule {
  days: string[]; // e.g. ['Monday', 'Wednesday', 'Friday']
  pickup_window: 'morning' | 'evening';
  service_type: 'linen_towel' | 'valet_dry_clean' | 'mixed';
  delivery_notes?: string;
}

export interface CommercialAccount {
  id: string;
  business_name: string;
  account_type: 'hotel' | 'medspa' | 'fitness_club' | 'salon' | 'corporate';
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  billing_email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  payment_terms: 'net_15' | 'net_30' | 'card_on_file';
  rate_card: CommercialRateCard;
  recurring_schedule: RecurringSchedule;
  sla_guarantee: string;
  created_at: string;
}

export interface CommercialInvoiceItem {
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

export interface CommercialInvoice {
  id: string;
  account_id: string;
  business_name: string;
  invoice_number: string;
  billing_period: string; // e.g. "August 1 - August 31, 2026"
  issue_date: string;
  due_date: string;
  total_weight_lbs: number;
  total_items: number;
  subtotal: number;
  tax: number;
  total: number;
  status: 'paid' | 'pending' | 'overdue';
  items: CommercialInvoiceItem[];
}
