import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { feeAndTaxOn } from '@/lib/constants';
import { ENV_FEE_LABEL, ENV_FEE_NOTE, SALES_TAX_LABEL } from '@/lib/published-prices';
import { feesLine } from '@/lib/ai/price-list';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#6): "Itemize all charges before checkout. Confirm whether the 3%
// environmental charge is a company fee or a statutory tax ... use consistent terminology."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Environmental Service Fee and sales tax', () => {
  it('one name each, with the live rates', () => {
    expect(ENV_FEE_LABEL).toBe('Environmental Service Fee (3%)');
    expect(SALES_TAX_LABEL).toBe('Texas Sales Tax (8.25%)');
    expect(ENV_FEE_NOTE).toContain('not a government tax');
  });

  it('sales tax is charged on the service price including the fee: $100 -> $3.00 fee, $8.50 tax', () => {
    expect(feeAndTaxOn(100)).toEqual({ environmentalFee: 3, salesTax: 8.5 });
  });

  it.each([
    'src/app/pricing/page.tsx',
    'src/components/booking/StepReview.tsx',
    'src/app/dashboard/orders/[id]/page.tsx',
    'src/components/orders/TicketFeedbackCard.tsx',
  ])('%s uses the shared labels', (file) => {
    const src = read(file);
    expect(src).toContain('ENV_FEE_LABEL');
    expect(src).toContain('SALES_TAX_LABEL');
    expect(src).not.toMatch(/Environmental Fee \(3%\)|'Environmental fee'|'Sales tax'/);
  });

  it('checkout explains the fee; Terms say what it is and that tax applies to it', () => {
    expect(read('src/components/booking/StepReview.tsx')).toContain('{ENV_FEE_NOTE}');
    const terms = read('src/app/terms/page.tsx');
    expect(terms).toContain('a First Eleven Cleaners charge (not a government tax)');
    expect(terms).toContain('including the Environmental Service Fee');
  });

  // Client 2026-10-20: "in Texas it's part of the sale, so sales tax applies to it too"
  it('a whole order taxes the fee too, with Express and the Zone 5 delivery fee', async () => {
    const { calculateOrderFinancials } = await import('@/lib/constants');
    const f = calculateOrderFinancials({ subtotal: 100, isExpress: true, extendedReachFee: 35 });
    expect(f.netSubtotal).toBe(185); // 100 + 50 Express + 35 delivery
    expect(f.environmentalFee).toBe(5.55);
    expect(f.taxableAmount).toBe(190.55);
    expect(f.salesTax).toBe(15.72); // 8.25% of 190.55, not of 185 (15.26)
    expect(f.finalTotal).toBe(206.27);
  });

  it('customers are told tax applies to the fee', () => {
    expect(ENV_FEE_NOTE).toContain('Texas sales tax applies to it, as part of the sale.');
    expect(feesLine('en')).toContain('Texas sales tax (charged on the fee too)');
  });

  it('one name everywhere: no "environmental fee" in what customers read', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
      });
    const offenders = files(join(__dirname, '..', 'src')).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && /environmental (fee|surcharge)|sustainability fee/i.test(line))
        .map((line) => `${f}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('the concierge says it in English and Spanish', () => {
    expect(feesLine('en')).toContain('Environmental Service Fee (our own charge, not a government tax)');
    expect(feesLine('es')).toContain('cargo de servicio ambiental de 3% (un cargo nuestro, no un impuesto del gobierno)');
  });
});
