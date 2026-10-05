import { NextResponse } from 'next/server';
import { SAMPLE_INVOICES } from '@/lib/commercial';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { apiError } from '@/lib/api-errors';
import { COMMERCIAL_PORTAL_ENABLED, portalDisabledResponse } from '@/lib/features';

export async function GET(req: Request) {
  if (!COMMERCIAL_PORTAL_ENABLED) return portalDisabledResponse(); // sample data, switched off (PR-20)
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
    return apiError('api/portal/invoices', err, 500);
  }
}

export async function POST(req: Request) {
  if (!COMMERCIAL_PORTAL_ENABLED) return portalDisabledResponse(); // sample data, switched off (PR-20)
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
    return apiError('api/portal/invoices', err, 500);
  }
}
