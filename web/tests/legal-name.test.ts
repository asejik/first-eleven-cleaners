import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_NAME } from '@/lib/legal';
import { buildSiteJsonLd } from '@/lib/seo';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#1): "consistently use First Eleven Cleaners, LLC" on About,
// Terms, Privacy, Checkout and the footer.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Legal name', () => {
  it('is First Eleven Cleaners, LLC', () => {
    expect(LEGAL_NAME).toBe('First Eleven Cleaners, LLC');
  });

  it.each([
    'src/app/terms/page.tsx',
    'src/app/privacy/page.tsx',
    'src/components/layout/Footer/Footer.tsx',
    'src/components/booking/StepPayment.tsx',
  ])('%s names the legal entity', (file) => {
    expect(read(file)).toContain('{LEGAL_NAME}');
  });

  it('About names it', () => {
    expect(read('src/app/about/page.tsx')).toContain('First Eleven Cleaners, LLC');
  });

  it('the structured data carries it', () => {
    expect(JSON.stringify(buildSiteJsonLd())).toContain('"legalName":"First Eleven Cleaners, LLC"');
  });
});
