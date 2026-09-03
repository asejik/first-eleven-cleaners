import { NextResponse } from 'next/server';
import { SAMPLE_INVOICES } from '@/lib/commercial';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';

export async function GET(req: Request) {
  const auth = await verifyApiAuth(['admin'], req);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');

  try {
    const invoices = accountId
      ? SAMPLE_INVOICES.filter((inv) => inv.account_id === accountId)
      : SAMPLE_INVOICES;

    return NextResponse.json({ invoices });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await verifyApiAuth(['admin'], req);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    const { invoice_id, action } = body;

    if (action === 'pay_invoice' && invoice_id) {
      const inv = SAMPLE_INVOICES.find((i) => i.id === invoice_id);
      if (inv) {
        inv.status = 'paid';
      }
      return NextResponse.json({ success: true, invoice: inv });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
