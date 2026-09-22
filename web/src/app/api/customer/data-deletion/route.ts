import { NextResponse } from 'next/server';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';

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

    // Record immutable audit log entry (F008 Fix)
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_id: customer.id,
        admin_email: customer.email,
        action: 'tdpsa_privacy_request',
        target_type: 'customer',
        target_id: customer.id,
        details: {
          request_id: requestId,
          request_type,
          notes,
        },
        ip_address: clientIp,
      });
    } catch (auditErr) {
      console.warn('Failed to log TDPSA audit entry:', auditErr);
    }

    // Send compliance alert to privacy officer (F008 Fix)
    try {
      await sendEmail({
        to: 'concierge@firstelevencleaners.com',
        subject: `🔒 Action Required: TDPSA Personal Data Request (${String(request_type).toUpperCase()}) - ${customer.email}`,
        html: `
          <h2>Texas Data Privacy and Security Act (TDPSA) Request</h2>
          <p>A customer has submitted a formal <strong>${String(request_type).toUpperCase()}</strong> request under the Texas Data Privacy and Security Act.</p>
          <ul>
            <li><strong>Request ID:</strong> ${requestId}</li>
            <li><strong>Customer Name:</strong> ${customer.full_name}</li>
            <li><strong>Customer Email:</strong> ${customer.email}</li>
            <li><strong>Customer Phone:</strong> ${customer.phone || 'N/A'}</li>
            <li><strong>Customer ID:</strong> ${customer.id}</li>
            <li><strong>Submitted At:</strong> ${new Date().toISOString()}</li>
            <li><strong>Statutory Response Deadline:</strong> 45 calendar days</li>
          </ul>
          ${notes ? `<p><strong>Customer Notes:</strong> ${notes}</p>` : ''}
        `,
      });
    } catch (emailErr) {
      console.warn('Failed to dispatch privacy alert email:', emailErr);
    }

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
