import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { verifyOtp, exchangeCodeForSession } }),
}));

import { GET } from '@/app/auth/confirm/route';

function confirm(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/confirm${query}`));
}

function redirectPath(res: Response) {
  const location = new URL(res.headers.get('location') || '');
  return location.pathname + location.search;
}

describe('/auth/confirm email link handler (SEC-28)', () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    exchangeCodeForSession.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('verifies a signup confirmation link and sends the user to the dashboard', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm('?token_hash=abc123&type=email');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'email', token_hash: 'abc123' });
    expect(res.status).toBe(307);
    expect(redirectPath(res)).toBe('/dashboard');
  });

  it('sends a verified password-reset link to the set-new-password page', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm('?token_hash=abc123&type=recovery');
    expect(redirectPath(res)).toBe('/reset-password');
  });

  it('sends an expired or invalid link back to login with a message', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    const res = await confirm('?token_hash=old&type=email');
    expect(redirectPath(res)).toBe('/login?error=link_expired');
  });

  it('rejects unknown link types without calling Supabase', async () => {
    const res = await confirm('?token_hash=abc123&type=bogus');
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(redirectPath(res)).toBe('/login?error=link_expired');
  });

  it('exchanges a PKCE code from the default Supabase templates', async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const res = await confirm('?code=pkce-code');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('pkce-code');
    expect(redirectPath(res)).toBe('/dashboard');
  });

  it('never redirects off-site, whatever the query string says', async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const res = await confirm('?token_hash=abc123&type=email&next=https://evil.example');
    expect(new URL(res.headers.get('location') || '').origin).toBe('http://localhost:3000');
  });
});
