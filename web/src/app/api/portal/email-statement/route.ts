import { NextResponse } from 'next/server';
import { sendEmail, buildStatementEmailHtml } from '@/lib/resend';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      recipient_email,
      business_name,
      invoice_number,
      billing_period,
      subtotal,
      tax,
      total,
      status,
      items,
    } = body;

    if (!recipient_email || !invoice_number) {
      return NextResponse.json(
        { error: 'recipient_email and invoice_number are required.' },
        { status: 400 }
      );
    }

    const html = buildStatementEmailHtml({
      businessName: business_name || 'Commercial Client',
      invoiceNumber: invoice_number,
      billingPeriod: billing_period || 'Current Billing Cycle',
      subtotal: Number(subtotal) || 0,
      tax: Number(tax) || 0,
      total: Number(total) || 0,
      status: status || 'unpaid',
      items: Array.isArray(items) ? items : [],
    });

    const result = await sendEmail({
      to: recipient_email,
      subject: `First Eleven Cleaners Statement #${invoice_number} — ${business_name || 'Commercial Account'}`,
      html,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message_id: result.id,
      message: `Statement #${invoice_number} dispatched to ${recipient_email} via Resend.`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
