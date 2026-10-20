import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feeAndTaxOn } from '@/lib/constants';
import { ENV_FEE_LABEL, ENV_FEE_NOTE, SALES_TAX_LABEL } from '@/lib/published-prices';

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
});
