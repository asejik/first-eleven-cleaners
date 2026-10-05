import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isStaffRoute } from '@/lib/staff-routes';

// ---------------------------------------------------------------------------
// P05 AR-17: the driver manifest, intake station and Mission Control carried the
// customer marketing footer (about 900 px tall on a phone) and the floating
// concierge bubble, which overlapped staff controls.
// ---------------------------------------------------------------------------
describe('Staff screens drop customer-only chrome (AR-17)', () => {
  it.each(['/mission-control', '/mission-control/intake', '/staff/driver', '/admin', '/driver'])('%s is a staff route', (path) => {
    expect(isStaffRoute(path)).toBe(true);
  });

  it.each(['/', '/book', '/dashboard', '/track/abc', '/pricing', '/staffing-news'])('%s is not', (path) => {
    expect(isStaffRoute(path)).toBe(false);
  });

  it('the layout wraps the footer and concierge so staff routes hide them', () => {
    const layout = readFileSync(join(__dirname, '..', 'src/app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/<CustomerOnly>\s*<Footer \/>\s*<\/CustomerOnly>/);
    expect(layout).toMatch(/<CustomerOnly>\s*<DynamicConcierge \/>\s*<\/CustomerOnly>/);
  });
});
