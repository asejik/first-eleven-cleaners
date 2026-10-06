import { describe, it, expect, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepPayment } from '@/components/booking/StepPayment';

// ---------------------------------------------------------------------------
// P05 AR-18: without Square's public keys, the payment step showed plain
// "Card Number / Expires / CVC" boxes. In production that would ask customers to
// type card numbers into a non-Square field (ignored; the booking is refused).
// Production now shows "temporarily unavailable" with the phone number instead.
// ---------------------------------------------------------------------------
const env = process.env as Record<string, string | undefined>;
const original = { ...env };
afterEach(() => {
  for (const k of ['NODE_ENV', 'NEXT_PUBLIC_SQUARE_APP_ID', 'NEXT_PUBLIC_SQUARE_LOCATION_ID']) env[k] = original[k];
});

const render = () =>
  renderToStaticMarkup(
    createElement(StepPayment, {
      serviceType: 'dry_clean',
      cardNumber: '',
      setCardNumber: () => {},
      cardExpiry: '',
      setCardExpiry: () => {},
      cardCvc: '',
      setCardCvc: () => {},
      total: 41.97,
      holdAmount: 50.36,
      holdNow: true,
      paymentTermsAccepted: false,
      setPaymentTermsAccepted: () => {},
      isLoading: false,
      onBack: () => {},
      onCompleteBooking: () => {},
    })
  );

describe('Payment step without Square keys (AR-18)', () => {
  it('production shows an unavailable notice, never plain card fields', () => {
    env.NODE_ENV = 'production';
    delete env.NEXT_PUBLIC_SQUARE_APP_ID;
    delete env.NEXT_PUBLIC_SQUARE_LOCATION_ID;
    const html = render();
    expect(html).toContain('Online booking is temporarily unavailable');
    expect(html).toContain('(682) 200-0039');
    expect(html).not.toContain('Card Number');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*(<[^>]+>)*[^<]*Confirm Pickup/);
  });

  it('local development keeps the test card fields', () => {
    env.NODE_ENV = 'development';
    delete env.NEXT_PUBLIC_SQUARE_APP_ID;
    expect(render()).toContain('Card Number');
  });
});
