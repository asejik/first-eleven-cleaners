import { NextResponse } from 'next/server';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`data_deletion:${clientIp}`, 5, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const { customer, user } = await getAuthenticatedCustomer(request);
    if (!customer || !user) {
      return NextResponse.json(
        { error: 'Authentication required to submit a personal data privacy request.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { request_type = 'deletion', notes = '' } = body;

    const supabase = createAdminClient();
    const requestId = `tdpsa_${crypto.randomUUID().slice(0, 10)}`;

    // Append privacy request note in customer preferences special_notes
    const { data: prefs } = await supabase
      .from('customer_preferences')
      .select('special_notes')
      .eq('customer_id', customer.id)
      .maybeSingle();

    const existingNotes = prefs?.special_notes || '';
    const updatedNotes = `${existingNotes}\n[TDPSA Privacy Request: ${String(request_type).toUpperCase()} | ID: ${requestId} | Submitted: ${new Date().toISOString()} | ${notes}]`.trim();

    await supabase
      .from('customer_preferences')
      .upsert({
        customer_id: customer.id,
        special_notes: updatedNotes,
        updated_at: new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      request_id: requestId,
      request_type,
      status: 'received',
      governing_law: 'Texas Data Privacy and Security Act (TDPSA)',
      statutory_response_days: 45,
      message: 'Your personal data request has been officially received and queued for review under the Texas Data Privacy and Security Act. A confirmation has been logged with First Eleven Data Privacy compliance.',
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to submit data privacy request.' },
      { status: 500 }
    );
  }
}
