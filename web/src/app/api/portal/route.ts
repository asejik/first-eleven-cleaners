import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import {
  COMMERCIAL_RATE_CARDS,
  SAMPLE_RECURRING_SCHEDULES,
} from '@/lib/commercial';
import type { CommercialAccount } from '@/lib/commercial/types';

export async function GET(req: Request) {
  const auth = await verifyApiAuth(['admin'], req);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');

  try {
    const supabase = createAdminClient();
    const { data: dbAccounts, error } = await supabase
      .from('commercial_accounts')
      .select('id, business_name, contact_name, contact_email, contact_phone, billing_email, rate_card_id, payment_terms, created_at')
      .order('business_name', { ascending: true });

    if (error) {
      console.warn('Commercial accounts fetch notice:', error);
    }

    const accounts: CommercialAccount[] = (dbAccounts || []).map((acc) => {
      const rateCardKey = acc.rate_card_id || 'rate_card_hospitality_vip';
      const rateCard = COMMERCIAL_RATE_CARDS[rateCardKey] || COMMERCIAL_RATE_CARDS.rate_card_hospitality_vip;
      const schedule = SAMPLE_RECURRING_SCHEDULES[acc.id] || {
        days: ['Monday', 'Wednesday', 'Friday'],
        pickup_window: 'morning',
        service_type: 'mixed',
        delivery_notes: 'Loading dock entrance. Ring commercial service bell.',
      };

      return {
        id: acc.id,
        business_name: acc.business_name,
        account_type: acc.business_name.includes('Hotel')
          ? 'hotel'
          : acc.business_name.includes('MedSpa')
          ? 'medspa'
          : 'fitness_club',
        contact_name: acc.contact_name,
        contact_email: acc.contact_email,
        contact_phone: acc.contact_phone,
        billing_email: acc.billing_email || acc.contact_email,
        address: '1530 Main St / DFW Metro Center',
        city: 'Dallas',
        state: 'TX',
        zip: '75201',
        payment_terms: (acc.payment_terms as 'net_15' | 'net_30' | 'card_on_file') || 'net_30',
        rate_card: rateCard,
        recurring_schedule: schedule,
        sla_guarantee: `${rateCard.turnaround_hours}-Hour Dedicated Commercial SLA`,
        created_at: acc.created_at,
      };
    });

    const activeAccount = accountId
      ? accounts.find((a) => a.id === accountId) || accounts[0]
      : accounts[0];

    return NextResponse.json({
      accounts,
      activeAccount,
      stats: {
        total_monthly_lbs: 2720,
        active_hampers: 14,
        on_time_sla_rate: '100%',
        next_pickup: 'Tomorrow (7:30 AM – Morning Shift)',
        current_cycle_spend: 6633.57,
      },
    });
  } catch (err: unknown) {
    console.error('Commercial API error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], req);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await req.json();
    const { account_id, schedule } = body;

    if (!account_id) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    if (schedule) {
      SAMPLE_RECURRING_SCHEDULES[account_id] = schedule;
    }

    return NextResponse.json({ success: true, updatedSchedule: schedule });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
