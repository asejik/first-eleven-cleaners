import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/constants';
import { SUPPORT_EMAIL_HREF, SUPPORT_PHONE_HREF } from '@/lib/contact';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#14): "insufficiently prominent contact details ... visible
// customer-support information, and clear booking links."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Support contact details', () => {
  it('one phone and email link everywhere', () => {
    expect(SUPPORT_PHONE_HREF).toBe(`tel:+1${SUPPORT_PHONE.replace(/\D/g, '')}`);
    expect(SUPPORT_PHONE_HREF).toMatch(/^tel:\+1\d{10}$/);
    expect(SUPPORT_EMAIL_HREF).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it('the header has the number for customers and visitors: beside Log In, a call button on phones, and in the menu', () => {
    const header = read('src/components/layout/Header/Header.tsx');
    expect(header).toContain("const showContact = !isAuth || role === 'customer';");
    expect(header).toContain('className={styles.phoneLink}');
    expect(header).toContain('className={styles.mobileCall}');
    expect(header).toContain('Call {SUPPORT_PHONE}');
    expect(header).toContain('href={SUPPORT_EMAIL_HREF}');
  });

  it('the homepage and footer show both', () => {
    const home = read('src/app/page.tsx');
    expect(home).toContain('Questions? Call <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE}</a>');
    expect(home).toContain('<a href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>');
    const footer = read('src/components/layout/Footer/Footer.tsx');
    expect(footer).toContain('href={SUPPORT_PHONE_HREF}');
    expect(footer).toContain('href={SUPPORT_EMAIL_HREF}');
  });
});
