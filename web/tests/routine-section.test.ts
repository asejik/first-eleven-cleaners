import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTINE_PLAN_DISCOUNT_PERCENT } from '@/lib/constants';
import { planFromQuery, routineHighlights, ROUTINE_MAX_PAUSE_WEEKS, ROUTINE_SIGNUP_PATH } from '@/lib/routine';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#12): "Add a visible 'First Eleven Routine' section featuring
// weekly/biweekly pickups, customer scheduling, and skip options ... visible on the homepage,
// pricing page, and customer dashboard."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('First Eleven Routine section', () => {
  it('says what the membership does, with the live discounts, windows and pause limit', () => {
    const text = routineHighlights().map((h) => `${h.title}: ${h.text}`).join('\n');
    expect(text).toContain('Weekly or every other week');
    expect(text).toContain('mornings 7:30 to 10:00 AM or evenings 5:00 to 8:00 PM');
    expect(text).toContain(`Weekly saves ${ROUTINE_PLAN_DISCOUNT_PERCENT.weekly}% and Bi-Weekly ${ROUTINE_PLAN_DISCOUNT_PERCENT.biweekly}%`);
    expect(text).toContain('replying SKIP');
    expect(text).toContain(`pause for up to ${ROUTINE_MAX_PAUSE_WEEKS} weeks, or cancel anytime with no fee`);
  });

  it('is on the homepage, the pricing page and the dashboard', () => {
    expect(read('src/app/page.tsx')).toContain('<RoutineSection id="routine" />');
    expect(read('src/app/pricing/page.tsx')).toContain('<RoutineSection id="routine"');
    expect(read('src/app/pricing/page.tsx')).toContain('id="member-prices"');
    expect(read('src/app/dashboard/page.tsx')).toContain('<RoutineCard');
    expect(read('src/components/dashboard/RoutineCard.tsx')).toContain('href={ROUTINE_PATH}');
  });

  it('"Start Your Routine" opens booking with Weekly picked', () => {
    expect(ROUTINE_SIGNUP_PATH).toBe('/book?plan=weekly');
    expect(planFromQuery('weekly')).toBe('weekly');
    expect(planFromQuery('biweekly')).toBe('biweekly');
    expect(planFromQuery('monthly')).toBeNull();
    expect(planFromQuery(null)).toBeNull();
    expect(read('src/hooks/useBookingState.ts')).toContain("planFromQuery(new URLSearchParams(window.location.search).get('plan'))");
  });
});
