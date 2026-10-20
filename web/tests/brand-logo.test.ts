import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#16): the approved logo has white "FIRST ELEVEN" text, which
// vanished on the white sign-in cards. Light pages use the navy-text copy.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Logo on light backgrounds', () => {
  it('the navy-text logo exists', () => {
    expect(existsSync(join(__dirname, '..', 'public/logo-on-light.png'))).toBe(true);
  });

  it.each(['login', 'signup', 'forgot-password', 'reset-password'])('/%s (white card) uses the navy-text logo', (page) => {
    const src = read(`src/app/${page}/page.tsx`);
    expect(src).toContain('src="/logo-on-light.png"');
    expect(src).not.toContain('src="/logo.png"');
  });
});
