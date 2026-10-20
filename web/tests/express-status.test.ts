import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPRESS_COMING_SOON, EXPRESS_COMING_SOON_BADGE } from '@/lib/published-prices';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#5): "Express is advertised as 'Available Soon' in one section but
// offered as active elsewhere ... apply the same status, pricing, and turnaround commitment
// throughout." While Mission Control's Express switch is off, every page says Coming Soon.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Express status is the same on every page', () => {
  it('one wording', () => {
    expect(EXPRESS_COMING_SOON_BADGE).toBe('Coming Soon');
    expect(EXPRESS_COMING_SOON).toMatch(/^24-Hour Express is coming soon\./);
  });

  it('the homepage card uses it when the switch is off', () => {
    const home = read('src/app/page.tsx');
    expect(home).toContain(': EXPRESS_COMING_SOON}');
    expect(home).toContain("{expressEnabled ? 'From +50%' : EXPRESS_COMING_SOON_BADGE}");
    expect(home).not.toContain('Available Soon');
  });

  it('the pricing page shows the Express details only when the switch is on', () => {
    const pricing = read('src/app/pricing/page.tsx');
    expect(pricing).toContain("{coverage.expressEnabled ? 'Capacity Governed' : EXPRESS_COMING_SOON_BADGE}");
    expect(pricing).toContain('{!coverage.expressEnabled ? (');
    expect(pricing).toContain('<p className={styles.expressPromise}>{EXPRESS_COMING_SOON}</p>');
    expect(pricing).toContain('`(${EXPRESS_COMING_SOON_BADGE})`');
  });

  it('Commercial no longer offers express service', () => {
    expect(read('src/app/commercial/page.tsx')).not.toMatch(/express guest/i);
  });
});
