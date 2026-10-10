import type { SupabaseClient } from '@supabase/supabase-js';
import { PROMO_CODE_LAUNCH } from '@/lib/constants';

/** A promo code as applied in the booking flow. */
export interface AppliedPromo {
  code: string;
  /** 'referral': a friend's code, dollars off a first order (client 2026-10-10) */
  discount_type: 'percentage' | 'fixed' | 'referral';
  discount_value: number;
}

/**
 * Has this customer already used the code on a live (not cancelled) order? One use per
 * customer per code (SEC-15). The promo box and the booking share this rule (P05 AR-02).
 */
export async function hasUsedPromo(supabase: SupabaseClient, customerId: string, code: string): Promise<boolean> {
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('promo_code', code)
    .neq('status', 'cancelled');
  return (count ?? 0) > 0;
}

/** Customer-facing message for a code already used on this account. */
export function promoUsedMessage(code: string): string {
  return code === PROMO_CODE_LAUNCH
    ? `${code} is for your first order only, and it has already been used on this account.`
    : `Promo code ${code} has already been used on this account.`;
}

/** The discount inputs calculateOrderFinancials() needs for an applied code (fixed codes are dollars, SEC-15). */
export function promoFinancialInputs(promo: AppliedPromo | null): { discountPercent: number; discountAmount: number | undefined } {
  if (!promo) return { discountPercent: 0, discountAmount: undefined };
  return promo.discount_type === 'fixed' || promo.discount_type === 'referral'
    ? { discountPercent: 0, discountAmount: promo.discount_value }
    : { discountPercent: promo.discount_value, discountAmount: undefined };
}
