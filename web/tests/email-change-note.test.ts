import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-21: the profile shows the email read-only with no way to change it and
// no explanation. Customers are now told how to change it.
// ---------------------------------------------------------------------------
describe('Profile explains how to change the email (AR-21)', () => {
  it('shows the support contact under the email', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/dashboard/profile/page.tsx'), 'utf8');
    expect(page).toMatch(/To change your email, contact us at/);
    expect(page).toContain('mailto:${SUPPORT_EMAIL}');
  });
});
