import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { priceIntakeLine, MAX_QUOTED_UNIT_PRICE } from '@/lib/intake-quote';

// ---------------------------------------------------------------------------
// Client 2026-10-06 (option b): intake can quote a higher price for "from" items
// (evening gown, wedding dress, drapes; lined drapes are quoted at intake). Never
// below the starting price, only for "from" items, recorded in the audit log.
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('Intake quotes for "from" items', () => {
  it('charges the catalog price when nothing is quoted', () => {
    expect(priceIntakeLine('wedding_dress', 1)).toEqual({ ok: true, unitPrice: 149.99, subtotal: 149.99 });
    expect(priceIntakeLine('napkin', 12)).toEqual({ ok: true, unitPrice: 5.99, subtotal: 64.99 });
  });

  it('accepts a higher quote for a "from" item', () => {
    expect(priceIntakeLine('wedding_dress', 1, 225)).toEqual({
      ok: true,
      unitPrice: 225,
      subtotal: 225,
      quote: { listed: 149.99, quoted: 225 },
    });
    // Two lined long drapes at $79.50 each
    const drapes = priceIntakeLine('drapes_long', 2, 79.5);
    expect(drapes.ok && drapes.subtotal).toBe(159);
  });

  it('treats a quote equal to the starting price as no quote', () => {
    expect(priceIntakeLine('evening_gown', 1, 44.99)).toEqual({ ok: true, unitPrice: 44.99, subtotal: 44.99 });
  });

  it.each([
    ['wedding_dress', 100, /can't be below its starting price of \$149\.99/],
    ['jacket', 30, /fixed price and can't be quoted/],
    ['not_an_item', 30, /fixed price and can't be quoted/],
    ['evening_gown', 50.555, /dollars and cents/],
    ['evening_gown', MAX_QUOTED_UNIT_PRICE + 1, /looks too high/],
  ])('refuses %s quoted at %d', (key, quoted, message) => {
    const line = priceIntakeLine(key, 1, quoted);
    expect(line.ok).toBe(false);
    if (!line.ok) expect(line.error).toMatch(message);
  });

  it('keeps the old $8.99 fallback for items not in the catalog', () => {
    expect(priceIntakeLine('mystery_item', 2)).toEqual({ ok: true, unitPrice: 8.99, subtotal: 17.98 });
  });
});

describe('Intake API and screen use the quote rule', () => {
  const api = read('app/api/intake/route.ts');

  it('validates quotes before the card is charged and records them', () => {
    expect(api).toContain('quoted_unit_price: z.number(');
    expect(api).toContain('priceIntakeLine(item.garment_type, qty, item.quoted_unit_price)');
    expect(api.indexOf('priceIntakeLine(')).toBeLessThan(api.indexOf('chargeCardOnFile('));
    expect(api).toContain("action: 'order.intake_price_quote'");
    expect(api).toContain('Quoted at intake: $');
  });

  it('the intake screen sends the quote and blocks an invalid one', () => {
    const ws = read('components/mission-control/IntakeTicketWorkspace.tsx');
    expect(ws).toContain('priceIntakeLine(key, dryCleanCounts[key], quoteFor(key))');
    expect(ws).toContain('quoted_unit_price: quoteFor(k)');
    expect(ws).toContain('quoteErrors.length > 0');
  });
});
