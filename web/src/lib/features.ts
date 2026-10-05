import { NextResponse } from 'next/server';

/**
 * Commercial (B2B) portal (P03 PR-20). It currently runs on sample data (invoices,
 * schedules, addresses), so it is switched off for launch: the /portal pages and
 * /api/portal* return 404, and admin links to it are hidden. Turn on only once it is
 * built on real commercial_accounts / invoice data.
 */
export const COMMERCIAL_PORTAL_ENABLED = false;

export function portalDisabledResponse(): NextResponse {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
