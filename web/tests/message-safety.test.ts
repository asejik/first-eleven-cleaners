import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { rateCounts, dispatchStageNotification } = vi.hoisted(() => ({
  rateCounts: new Map<string, number>(),
  dispatchStageNotification: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/rate-limiter', () => ({
  // Counts per key, like the real limiter, so per-contact limits can be exercised
  checkRateLimitAsync: async (key: string, max: number) => {
    const count = (rateCounts.get(key) || 0) + 1;
    rateCounts.set(key, count);
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  },
  getClientIp: () => '127.0.0.1',
}));
vi.mock('@/lib/messaging', () => ({ messagingService: { dispatchStageNotification } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}));

import { escapeHtml, greetingFirstName, personNameSchema } from '@/lib/sanitize';
import { buildWelcomeEmailHtml, buildStageNotificationEmailHtml, buildStatementEmailHtml } from '@/lib/resend';
import { formatStageMessage } from '@/lib/messaging/templates';
import { POST as bookingPOST } from '@/app/api/bookings/route';

const PHISHING_NAME = '<a/href=//evil.example>Verify-your-card</a>';

describe('Email HTML escaping (SEC-09)', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<b>"Tom" & 'Jerry'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;');
  });

  it('welcome email shows a phishing name as harmless text, with no injected link', () => {
    const html = buildWelcomeEmailHtml({ name: PHISHING_NAME });
    expect(html).not.toContain('<a/href');
    expect(html).not.toContain('evil.example');
  });

  it('stage notification email escapes the name, message body and tracking URL', () => {
    const html = buildStageNotificationEmailHtml({
      stageTitle: 'Booked',
      customerName: PHISHING_NAME,
      orderNumber: 'F11-2026-TEST',
      messageBody: 'Hi <script>alert(1)</script>',
      trackingUrl: 'https://example.com/track/1"><img src=x>',
    });
    expect(html).not.toContain('<a/href');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('"><img');
  });

  it('statement email escapes business and line-item text', () => {
    const html = buildStatementEmailHtml({
      businessName: '<img src=x onerror=alert(1)>',
      invoiceNumber: 'INV-1',
      billingPeriod: 'October',
      subtotal: 10,
      tax: 0.83,
      total: 10.83,
      status: 'due',
      items: [{ description: '<b>Towels</b>', quantity: 1, unit: 'lb', unit_price: 10, total: 10 }],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<b>Towels</b>');
  });
});

describe('SMS greeting (SEC-09)', () => {
  it('reduces names to letters so no link or markup reaches an SMS', () => {
    expect(greetingFirstName('evil.com Smith')).toBe('evilcom');
    expect(greetingFirstName('12345')).toBe('Valued Customer');
    expect(greetingFirstName("O'Brien")).toBe("O'Brien");
    const sms = formatStageMessage({
      orderId: '00000000-0000-0000-0000-000000000000',
      orderNumber: 'F11-2026-TEST',
      customerName: PHISHING_NAME,
      customerPhone: '2145550100',
      stage: 'booked',
      trackingUrl: 'https://www.firstelevencleaners.com/track/1',
    });
    expect(sms.smsBody).not.toMatch(/evil\.example|<|>/);
  });
});

describe('Person name validation (SEC-09)', () => {
  it.each(['José García', "Siobhán O'Brien", 'Mary-Jane Watson', 'J. R. Smith', 'Zoë Kravitz', 'Nguyễn Văn An'])(
    'accepts %s',
    (name) => {
      expect(personNameSchema.safeParse(name).success).toBe(true);
    }
  );

  it.each([PHISHING_NAME, 'evil.com', 'Visit evil.com now', 'Bob2', 'A', '<b>Bold</b>'])('rejects %s', (name) => {
    expect(personNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('Booking API name check and per-contact limits (SEC-09)', () => {
  const originalEnv = { ...process.env };

  function booking(name: string, email = 'limit.tester@example.com', phone = '2145550100') {
    const todayTx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
    const d = new Date(`${todayTx}T12:00:00`);
    d.setDate(d.getDate() + 2); // first Monday at least 2 days ahead (standard minimum, PR-12)
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
    return new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer: { full_name: name, email, phone },
        address: { street: '100 Test St', city: 'Dallas', state: 'TX', zip: '75201' },
        services: { type: 'wash_fold', dry_clean_items: [], estimated_weight_lbs: 15 },
        consents: { payment_terms: true },
        schedule: { pickup_date: d.toISOString().split('T')[0], pickup_window: 'morning', express_tier: 'standard' },
      }),
    });
  }

  beforeEach(() => {
    rateCounts.clear();
    dispatchStageNotification.mockClear();
    // Local mock mode: no database or Square needed to exercise validation and limits
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SQUARE_ACCESS_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('rejects a phishing name with a readable message and sends nothing', async () => {
    const res = await bookingPOST(booking(PHISHING_NAME));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Name can only contain letters, spaces, hyphens, apostrophes and periods.');
    expect(dispatchStageNotification).not.toHaveBeenCalled();
  });

  it('allows 5 bookings per email per hour, then returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      // Different phone each time, so only the email limit applies
      const res = await bookingPOST(booking('Limit Tester', 'limit.tester@example.com', `21455501${10 + i}`));
      expect(res.status).toBe(200);
    }
    const sixth = await bookingPOST(booking('Limit Tester', 'LIMIT.Tester@example.com', '2145550199'));
    expect(sixth.status).toBe(429);
  });

  it('allows 5 bookings per phone number per hour, then returns 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await bookingPOST(booking('Limit Tester', `phone.tester${i}@example.com`, '(214) 555-0100'));
      expect(res.status).toBe(200);
    }
    const sixth = await bookingPOST(booking('Limit Tester', 'phone.tester9@example.com', '214-555-0100'));
    expect(sixth.status).toBe(429);
  });
});
