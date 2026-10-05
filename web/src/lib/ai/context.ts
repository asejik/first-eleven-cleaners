import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { Address, Order, CustomerPreferences } from '@/types';
import type { ConciergeContext } from '@/lib/ai/types';

/**
 * "Eleven's Memory" for a known customer: preferences, default address and recent
 * orders. Shared by the web concierge and the SMS/WhatsApp concierge (P05 AR-19).
 * The gate code is never loaded: the AI doesn't need it, so it isn't sent to the provider.
 */
export async function loadConciergeContext(
  supabase: SupabaseClient<Database>,
  customer: { id: string; full_name: string; phone?: string | null; email?: string | null }
): Promise<ConciergeContext> {
  const { data: prefs } = await supabase
    .from('customer_preferences')
    .select('customer_id, starch_level, fold_vs_hang, detergent_sensitivity, delivery_instructions, special_notes')
    .eq('customer_id', customer.id)
    .maybeSingle();

  const { data: address } = await supabase
    .from('addresses')
    .select('id, street, unit, city, state, zip, delivery_notes')
    .eq('customer_id', customer.id)
    .eq('is_default', true)
    .maybeSingle();

  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, status, order_type, pickup_date, total, address:addresses(street, city, zip)')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(3);

  return {
    customerId: customer.id,
    customerName: customer.full_name,
    customerPhone: customer.phone ?? undefined,
    customerEmail: customer.email ?? undefined,
    customerPreferences: (prefs as unknown as CustomerPreferences) || null,
    defaultAddress: (address as unknown as Address) || null,
    recentOrders: (orders as unknown as Order[]) || [],
  };
}
