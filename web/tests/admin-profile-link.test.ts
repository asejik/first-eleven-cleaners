import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20: the admin's name ("Lydia Painting (Plant Director)") shows in the
// top bar, but the admin had no way to reach Profile to change it. The name now links there,
// and the phone menu has "My Profile".
// ---------------------------------------------------------------------------
const header = readFileSync(join(__dirname, '..', 'src/components/layout/Header/Header.tsx'), 'utf8');

describe('Admin can reach Profile', () => {
  it('the name in the top bar links to Profile', () => {
    expect(header).toMatch(/role === 'admin' \? \([\s\S]*?<Link href=\{ROUTES\.profile\}[\s\S]*?\{user\?\.full_name \|\| 'Plant Director'\}/);
  });

  it('the phone menu has My Profile for the admin', () => {
    expect(header).toMatch(/role === 'admin' && \([\s\S]*?href=\{ROUTES\.profile\}[\s\S]*?My Profile/);
  });

  it('Profile lets the admin in', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/dashboard/profile/page.tsx'), 'utf8');
    expect(page).toContain("<AuthGuard allowedRoles={['admin', 'customer']}>");
  });
});
