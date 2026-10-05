import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// P05 AR-16: Next 16 renamed the `middleware` file convention to `proxy`; the
// build warned "The 'middleware' file convention is deprecated". Same session
// refresh (updateSession), same matcher.
// ---------------------------------------------------------------------------
const root = join(__dirname, '..');

describe('Next 16 proxy convention (AR-16)', () => {
  it('src/proxy.ts exports proxy() and src/middleware.ts is gone', () => {
    expect(existsSync(join(root, 'src/middleware.ts'))).toBe(false);
    const code = readFileSync(join(root, 'src/proxy.ts'), 'utf8');
    expect(code).toMatch(/export async function proxy\(request: NextRequest\)/);
    expect(code).toContain('return await updateSession(request);');
    // API routes stay excluded: they verify auth themselves
    expect(code).toContain("'/((?!_next/static|_next/image|favicon.ico|api|.*\\\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'");
  });
});
