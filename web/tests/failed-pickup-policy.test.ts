import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAILED_PICKUP_POLICY } from '@/lib/published-prices';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#11): "$15 fee; first occurrence waived; free rescheduling at least
// two hours in advance; no charge for company-caused failures", the same on Pricing, Terms and
// Booking.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Failed pickup policy', () => {
  it('one sentence with the four rules', () => {
    expect(FAILED_PICKUP_POLICY).toBe(
      "Failed pickup or delivery: $15. Your first one is waived, rescheduling at least 2 hours before your window is free, and there's no charge if we caused the miss.",
    );
  });

  it('booking shows it before the customer books', () => {
    expect(read('src/components/booking/StepReview.tsx')).toContain('{FAILED_PICKUP_POLICY}');
  });

  it('Pricing and Terms carry the same four rules', () => {
    const pricing = read('src/app/pricing/page.tsx');
    expect(pricing).toContain('Waived as a courtesy');
    expect(pricing).toContain('Customer reschedules &ge;2 hours beforehand:');
    expect(pricing).toContain('First Eleven courier or plant fault:');
    const terms = read('src/app/terms/page.tsx');
    expect(terms).toContain('<strong>First occurrence:</strong> Waived in full as a courtesy.');
    expect(terms).toContain('<strong>Customer reschedules &ge;2 hours beforehand:</strong> $0 fee.');
    expect(terms).toContain('<strong>First Eleven courier or plant delay:</strong> $0 fee.');
  });
});
