import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// The admin's Profile showed "Text Sign-In: Loading..." forever: text sign-in is customers only
// (/api/auth/phone-verification answers 403 to staff), and the card had no failed state.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Text Sign-In card', () => {
  it('only customers see it', () => {
    expect(read('src/app/dashboard/profile/page.tsx')).toContain("{user?.role === 'customer' && <TextSignInCard />}");
    expect(read('src/app/api/auth/phone-verification/route.ts')).toContain("verifyApiAuth(['customer'], request)");
  });

  it('a failed load says so, with Try again, instead of loading forever', () => {
    const card = read('src/app/dashboard/profile/TextSignInCard.tsx');
    expect(card).toContain('const { data, isError, refetch } = useQuery({');
    expect(card).toMatch(/\{isError \? \([\s\S]*?couldn&apos;t load your text sign-in status[\s\S]*?Try again[\s\S]*?\) : !data \?/);
  });
});
