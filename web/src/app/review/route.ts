import { NextResponse } from 'next/server';
import { GOOGLE_REVIEW_URL } from '@/lib/google-reviews';

/**
 * firstelevencleaners.com/review opens the Google review page. The review request message's
 * tracked link leads here (tracked links only open our own pages), and it is short enough for
 * cards and receipts.
 */
export function GET() {
  return NextResponse.redirect(GOOGLE_REVIEW_URL, 302);
}
