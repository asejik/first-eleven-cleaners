import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GOOGLE_REVIEW_URL } from '@/lib/google-reviews';

// ---------------------------------------------------------------------------
// Client 2026-10-20 sent the Google review link (and a QR code that opens it). Every delivered
// order is asked for a review the same way: no review gating behind "Looks good".
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n');

describe('Google reviews', () => {
  it("is the client's review link", () => {
    expect(GOOGLE_REVIEW_URL).toBe('https://g.page/r/CYtBj4hybBFbEBM/review');
  });

  it('the footer links to it, opening in a new tab', () => {
    const footer = read('src/components/layout/Footer/Footer.tsx');
    expect(footer).toContain('<a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer">');
    expect(footer).toContain('Review Us on Google');
  });

  it.each(['src/app/track/[orderId]/page.tsx', 'src/app/dashboard/orders/[id]/page.tsx'])(
    '%s asks every delivered order, whatever the ticket feedback',
    (page) => {
      expect(read(page)).toMatch(/order\??\.status === 'delivered' && <GoogleReviewCard \/>/);
    },
  );

  it('the review card does not depend on feedback', () => {
    const card = read('src/components/orders/GoogleReviewCard.tsx');
    expect(card).toContain('href={GOOGLE_REVIEW_URL}');
    expect(card).not.toMatch(/looks_good|feedback|rating|stars?\b/i);
  });
});
