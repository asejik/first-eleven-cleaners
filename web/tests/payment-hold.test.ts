import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  holdAmountFor,
  shouldPlaceHoldNow,
  planCapture,
  isHoldActive,
  PAYMENT_TERMS_TEXT,
} from '@/lib/payment-hold';
import { createHold, updateHoldAmount, completeHold, cancelHold, type SquareConfig } from '@/lib/square';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Part A: the card is held for the estimate x 1.20 (at least
// $45 or the zone minimum) and charged automatically at intake.
// ---------------------------------------------------------------------------
describe('Hold amount', () => {
  it('is the estimate x 1.20, in whole cents', () => {
    expect(holdAmountFor(100)).toBe(120);
    expect(holdAmountFor(51.73)).toBe(62.08); // 62.076 rounds to 62.08
  });

  it('is at least $45, or the zone minimum if higher', () => {
    expect(holdAmountFor(20)).toBe(45);
    expect(holdAmountFor(50, 60)).toBe(60);
    expect(holdAmountFor(50, 80)).toBe(80);
    expect(holdAmountFor(90, 60)).toBe(108);
  });
});

describe('When the hold is placed', () => {
  // 2026-10-07 is a Wednesday; noon in Dallas (CDT, UTC-5)
  const now = new Date('2026-10-07T12:00:00-05:00');

  it('now for a pickup within 2 days', () => {
    expect(shouldPlaceHoldNow('2026-10-07', now)).toBe(true);
    expect(shouldPlaceHoldNow('2026-10-09', now)).toBe(true);
  });

  it('later (by the daily job) for a pickup further out', () => {
    expect(shouldPlaceHoldNow('2026-10-10', now)).toBe(false);
    expect(shouldPlaceHoldNow('2026-11-20', now)).toBe(false);
  });

  it('uses the client checkout wording', () => {
    expect(PAYMENT_TERMS_TEXT).toBe(
      'Your card is authorized now for the estimated total and charged automatically once your order is weighed and itemized at Pickup. Quoted items may be confirmed up to 25% above the listed from-price; anything higher needs your OK.',
    );
  });
});

describe('What intake does with the hold', () => {
  it('lowers the hold to a smaller total and captures it', () => {
    expect(planCapture({ total: 80.5, holdAmount: 96, holdActive: true })).toEqual({
      kind: 'capture_hold',
      captureAmount: 80.5,
      lowerHold: true,
    });
  });

  it('captures an exact match without lowering', () => {
    expect(planCapture({ total: 96, holdAmount: 96, holdActive: true })).toEqual({
      kind: 'capture_hold',
      captureAmount: 96,
      lowerHold: false,
    });
  });

  it('captures the whole hold and charges the rest when the total is higher', () => {
    expect(planCapture({ total: 130.25, holdAmount: 96, holdActive: true })).toEqual({
      kind: 'capture_hold_and_charge_rest',
      captureAmount: 96,
      rest: 34.25,
    });
  });

  it('charges the card on file when there is no usable hold', () => {
    expect(planCapture({ total: 70, holdAmount: 96, holdActive: false })).toEqual({ kind: 'charge_card', amount: 70 });
    expect(planCapture({ total: 70, holdAmount: null, holdActive: true })).toEqual({ kind: 'charge_card', amount: 70 });
  });

  it('knows when a hold can still be captured', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(isHoldActive({ hold_status: 'held', hold_payment_id: 'p1', hold_expires_at: '2026-10-10T00:00:00Z' }, now)).toBe(true);
    expect(isHoldActive({ hold_status: 'held', hold_payment_id: 'p1', hold_expires_at: '2026-10-06T00:00:00Z' }, now)).toBe(false);
    expect(isHoldActive({ hold_status: 'captured', hold_payment_id: 'p1' }, now)).toBe(false);
    expect(isHoldActive({ hold_status: 'held', hold_payment_id: null }, now)).toBe(false);
  });
});

describe('Square hold requests', () => {
  const config: SquareConfig = { isLive: true, baseUrl: 'https://sq.test/v2', accessToken: 'EAAAtest', locationId: 'LOC1' };
  const calls: Array<{ url: string; method: string; body: Record<string, unknown> | null }> = [];

  const mockFetch = (responses: Array<Record<string, unknown>>) => {
    calls.length = 0;
    let i = 0;
    vi.stubGlobal('fetch', async (url: string, init: { method: string; body?: string }) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      const json = responses[Math.min(i++, responses.length - 1)];
      return { ok: !json.errors, json: async () => json };
    });
  };
  afterEach(() => vi.unstubAllGlobals());

  it('places a 7-day hold that Square cancels if not captured', async () => {
    mockFetch([{ payment: { id: 'pay_1', status: 'APPROVED', delayed_until: '2026-10-14T12:00:00Z' } }]);
    const res = await createHold(config, {
      squareCustomerId: 'cust_1',
      cardId: 'card_1',
      amount: 62.08,
      orderNumber: 'F11-TEST',
      idempotencyKey: 'hold_abc',
    });
    expect(res).toEqual({ ok: true, paymentId: 'pay_1', status: 'APPROVED', expiresAt: '2026-10-14T12:00:00Z' });
    expect(calls[0].url).toBe('https://sq.test/v2/payments');
    expect(calls[0].body).toMatchObject({
      autocomplete: false,
      delay_duration: 'PT168H',
      delay_action: 'CANCEL',
      amount_money: { amount: 6208, currency: 'USD' },
      source_id: 'card_1',
      customer_id: 'cust_1',
      idempotency_key: 'hold_abc',
    });
  });

  it('treats a hold that is not APPROVED as declined', async () => {
    mockFetch([{ payment: { id: 'pay_1', status: 'FAILED' } }]);
    const res = await createHold(config, { squareCustomerId: 'c', cardId: 'k', amount: 45, orderNumber: 'X', idempotencyKey: 'h' });
    expect(res.ok).toBe(false);
  });

  it('lowers a hold with the payment version token', async () => {
    mockFetch([{ payment: { version_token: 'v1' } }, { payment: { id: 'pay_1' } }]);
    const res = await updateHoldAmount(config, { paymentId: 'pay_1', amount: 50.25, idempotencyKey: 'upd_1' });
    expect(res.ok).toBe(true);
    expect(calls[1]).toMatchObject({
      url: 'https://sq.test/v2/payments/pay_1',
      method: 'PUT',
      body: { idempotency_key: 'upd_1', payment: { amount_money: { amount: 5025, currency: 'USD' }, version_token: 'v1' } },
    });
  });

  it('captures and releases holds', async () => {
    mockFetch([{ payment: { status: 'COMPLETED' } }]);
    expect(await completeHold(config, 'pay_1')).toEqual({ ok: true, status: 'COMPLETED' });
    expect(calls[0].url).toBe('https://sq.test/v2/payments/pay_1/complete');

    mockFetch([{ payment: { status: 'CANCELED' } }]);
    expect(await cancelHold(config, 'pay_1')).toEqual({ ok: true });
    expect(calls[0].url).toBe('https://sq.test/v2/payments/pay_1/cancel');
  });

  it('reports a capture Square refuses', async () => {
    mockFetch([{ errors: [{ code: 'CARD_DECLINED', detail: 'Card declined.' }] }]);
    expect(await completeHold(config, 'pay_1')).toEqual({ ok: false, error: 'Card declined.' });
  });
});

describe('Pricing page and welcome email describe the payment model', () => {
  it('uses the client sentence and drops the old "before any charge" promise', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { PRICING_PAYMENT_PROMISE } = await import('@/lib/payment-hold');
    const pricing = readFileSync(join(__dirname, '..', 'src', 'app', 'pricing', 'page.tsx'), 'utf8');
    expect(PRICING_PAYMENT_PROMISE).toBe(
      'Your card is authorized when you book and charged only when your order is weighed, photographed, and itemized; the ticket and photos arrive the moment we charge. Not right? One tap to Make It Right.',
    );
    expect(pricing).toContain('{PRICING_PAYMENT_PROMISE}');
    expect(pricing).not.toContain('before any charge is made');
    const email = readFileSync(join(__dirname, '..', 'src', 'lib', 'resend.ts'), 'utf8');
    expect(email).not.toContain('before your card is charged');
  });
});
