import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client answers 2026-10-21: "we respond the same business day". The Commercial form only
// waited 0.8 s and said thank you; enquiries now reach the support inbox, with spam protection,
// and a failed send is never shown as received.
// ---------------------------------------------------------------------------
const sendEmail = vi.fn();
const reportError = vi.fn();
const rateLimit = vi.fn();
vi.mock('@/lib/resend', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/error-reporting', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));
vi.mock('@/lib/rate-limiter', () => ({
  checkRateLimitAsync: (...a: unknown[]) => rateLimit(...a),
  getClientIp: () => '203.0.113.9',
}));

import { POST } from '@/app/api/commercial/inquiry/route';
import { buildInquiryEmail, CommercialInquirySchema } from '@/lib/commercial/inquiry';
import { SUPPORT_EMAIL } from '@/lib/constants';

const valid = {
  business_name: 'Uptown Wellness Spa',
  contact_name: 'Jane Smith',
  email: 'jane@uptownspa.com',
  phone: '(214) 555-0100',
  industry: 'salon_spa',
  volume: 'weekly_50_150',
  notes: 'Robes and towels, Tuesdays and Fridays.',
  website: '',
};
const post = (body: unknown) =>
  POST(new Request('http://localhost/api/commercial/inquiry', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));

describe('Commercial inquiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.mockResolvedValue({ allowed: true });
    sendEmail.mockResolvedValue({ success: true, id: 'em_1' });
    vi.stubEnv('RESEND_API_KEY', 'test-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('emails the enquiry to the support inbox, reply-to the business', async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toContain('We reply the same business day');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe(SUPPORT_EMAIL);
    expect(mail.replyTo).toBe('jane@uptownspa.com');
    expect(mail.subject).toBe('Commercial inquiry: Uptown Wellness Spa');
    for (const text of ['Jane Smith', '(214) 555-0100', 'Salon / Spa / Wellness', '50 - 150 lbs / week', 'Robes and towels']) {
      expect(mail.html).toContain(text);
    }
  });

  it('a failed email is not shown as received: the visitor gets the phone number', async () => {
    sendEmail.mockResolvedValue({ success: false, error: 'Resend down' });
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('(682) 200-0039');
    expect(reportError).toHaveBeenCalledWith('api/commercial/inquiry', expect.any(Error), expect.objectContaining({ alert: true }));
  });

  it('bots that fill the hidden field are thanked and not emailed', async () => {
    const res = await post({ ...valid, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('is rate-limited per visitor', async () => {
    rateLimit.mockResolvedValue({ allowed: false });
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(rateLimit.mock.calls[0][0]).toBe('commercial-inquiry:203.0.113.9');
  });

  it('rejects missing or invalid details', async () => {
    for (const bad of [{ ...valid, email: 'not-an-email' }, { ...valid, phone: '555' }, { ...valid, industry: 'casino' }, { ...valid, business_name: '' }]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('escapes what visitors type, and keeps the subject on one line', () => {
    const inquiry = CommercialInquirySchema.parse({ ...valid, business_name: 'Spa <b>X</b>\r\nBcc: x@y.z', notes: '<script>alert(1)</script>' });
    const { subject, html } = buildInquiryEmail(inquiry, 'Oct 21, 2026, 9:00 AM');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it('the page posts to the endpoint and no longer fakes the send', () => {
    const page = readFileSync(join(__dirname, '..', 'src/app/commercial/page.tsx'), 'utf8');
    expect(page).toContain("fetch('/api/commercial/inquiry'");
    expect(page).not.toContain('setTimeout(resolve');
    expect(page).toContain('className={styles.honeypot}');
  });
});
