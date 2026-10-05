import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { friendlyAuthError, passwordProblem, PASSWORD_HINT } from '@/lib/auth-messages';

// ---------------------------------------------------------------------------
// P05 AR-11: login, signup and password forms showed Supabase's raw error text,
// and the password hint said only "At least 8 characters" although the project
// also requires upper and lower case, a number and a symbol.
// ---------------------------------------------------------------------------
const src = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('Auth errors in plain language (AR-11)', () => {
  it.each([
    ['invalid_credentials', /email or password is incorrect/i],
    ['email_not_confirmed', /confirm your email/i],
    ['weak_password', /at least 8 characters/i],
    ['over_email_send_rate_limit', /too many emails/i],
    ['same_password', /different from your current/i],
    ['user_already_exists', /already exists/i],
  ])('%s', (code, expected) => {
    expect(friendlyAuthError({ code, message: 'raw supabase text' })).toMatch(expected);
  });

  it('unknown errors and network failures get a helpful fallback, never raw text', () => {
    const msg = friendlyAuthError(new Error('TypeError: Failed to fetch'));
    expect(msg).not.toContain('Failed to fetch');
    expect(msg).toMatch(/try again/i);
    expect(msg).toContain('(682) 200-0039');
  });

  it('useAuth never returns Supabase error text directly', () => {
    const hook = src('src/hooks/useAuth.tsx');
    expect(hook).not.toMatch(/error: (error|authError)\.message/);
    expect(hook).not.toMatch(/error: \(e as Error\)\.message/);
  });
});

describe('Password rule stated and checked before sending (AR-11)', () => {
  it('requires 8+ characters with upper, lower, number and symbol', () => {
    expect(passwordProblem('short1!')).not.toBeNull();
    expect(passwordProblem('alllowercase1!')).not.toBeNull();
    expect(passwordProblem('ALLUPPERCASE1!')).not.toBeNull();
    expect(passwordProblem('NoNumbers!!')).not.toBeNull();
    expect(passwordProblem('NoSymbols123')).not.toBeNull();
    expect(passwordProblem('Match-Ready26')).toBeNull();
  });

  it('signup, reset and profile forms state the full rule and check it', () => {
    expect(PASSWORD_HINT).toMatch(/uppercase.*lowercase.*number.*symbol/i);
    for (const page of ['src/app/signup/page.tsx', 'src/app/reset-password/page.tsx', 'src/app/dashboard/profile/page.tsx']) {
      const code = src(page);
      expect(code, page).toContain('passwordProblem(');
      expect(code, page).toContain('PASSWORD_HINT');
      expect(code, page).not.toContain('placeholder="At least 8 characters"');
    }
  });
});
