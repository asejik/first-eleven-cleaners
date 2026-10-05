/**
 * Server-side Square API helpers (card on file).
 *
 * Booking saves the customer's card to a Square customer (SEC-06); intake charges that
 * saved card for the final weighed total. Never import this from client components:
 * it reads SQUARE_ACCESS_TOKEN.
 */

const SQUARE_API_VERSION = '2025-01-23';

export interface SquareConfig {
  isLive: boolean;
  baseUrl: string;
  accessToken: string;
  locationId: string;
}

export function getSquareConfig(): SquareConfig {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN || '';
  const locationId = process.env.SQUARE_LOCATION_ID || process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || '';
  const isLive =
    accessToken.startsWith('EAAA') &&
    !accessToken.includes('placeholder') &&
    !accessToken.includes('your-token') &&
    Boolean(locationId);

  return {
    isLive,
    baseUrl:
      process.env.SQUARE_ENVIRONMENT === 'sandbox'
        ? 'https://connect.squareupsandbox.com/v2'
        : 'https://connect.squareup.com/v2',
    accessToken,
    locationId,
  };
}

interface SquareError {
  code?: string;
  detail?: string;
}

async function squareRequest<T>(
  config: SquareConfig,
  path: string,
  body?: Record<string, unknown>,
  method: 'GET' | 'POST' = 'POST'
): Promise<{ ok: true; data: T } | { ok: false; error: string; code?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_API_VERSION,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      const first: SquareError | undefined = json.errors?.[0];
      return { ok: false, error: first?.detail || 'Square request failed.', code: first?.code };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    console.error(`Square ${path} request error:`, err);
    return { ok: false, error: 'Could not reach the payment processor.' };
  }
}

export interface SavedCard {
  squareCustomerId: string;
  cardId: string;
  brand: string | null;
  last4: string | null;
}

/**
 * Stores a Web Payments SDK card token as a card on file. Reuses the customer's existing
 * Square customer when known, otherwise creates one. Square verifies the card on save.
 */
export async function saveCardOnFile(
  config: SquareConfig,
  {
    cardToken,
    existingSquareCustomerId,
    email,
    fullName,
    referenceId,
  }: {
    cardToken: string;
    existingSquareCustomerId?: string | null;
    email: string;
    fullName: string;
    referenceId: string;
  }
): Promise<{ ok: true; card: SavedCard } | { ok: false; error: string }> {
  let squareCustomerId = existingSquareCustomerId || '';

  if (!squareCustomerId) {
    const created = await squareRequest<{ customer: { id: string } }>(config, '/customers', {
      idempotency_key: crypto.randomUUID(),
      given_name: fullName,
      email_address: email,
      reference_id: referenceId,
    });
    if (!created.ok) return { ok: false, error: created.error };
    squareCustomerId = created.data.customer.id;
  }

  const saved = await squareRequest<{ card: { id: string; card_brand?: string; last_4?: string } }>(
    config,
    '/cards',
    {
      idempotency_key: crypto.randomUUID(),
      source_id: cardToken,
      card: {
        customer_id: squareCustomerId,
        cardholder_name: fullName,
        reference_id: referenceId,
      },
    }
  );
  if (!saved.ok) return { ok: false, error: saved.error };

  return {
    ok: true,
    card: {
      squareCustomerId,
      cardId: saved.data.card.id,
      brand: saved.data.card.card_brand || null,
      last4: saved.data.card.last_4 || null,
    },
  };
}

/**
 * Charges a saved card for an exact amount. The idempotency key is derived from the order
 * and amount, so a retried request can never charge the same total twice.
 */
export async function chargeCardOnFile(
  config: SquareConfig,
  {
    squareCustomerId,
    cardId,
    amount,
    orderId,
    orderNumber,
  }: {
    squareCustomerId: string;
    cardId: string;
    amount: number;
    orderId: string;
    orderNumber: string;
  }
): Promise<{ ok: true; paymentId: string; status: string } | { ok: false; error: string }> {
  const amountCents = Math.round(amount * 100);
  const result = await squareRequest<{ payment: { id: string; status: string } }>(config, '/payments', {
    // Square limits idempotency keys to 45 characters
    idempotency_key: `int_${orderId.replace(/-/g, '')}_${amountCents}`,
    source_id: cardId,
    customer_id: squareCustomerId,
    location_id: config.locationId,
    amount_money: { amount: amountCents, currency: 'USD' },
    autocomplete: true,
    reference_id: orderNumber,
    note: `First Eleven Cleaners - Order #${orderNumber} (Intake Weighed)`,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, paymentId: result.data.payment.id, status: result.data.payment.status };
}

/**
 * Refunds part or all of a completed payment. The caller supplies a stable idempotency key
 * (max 45 characters) so a repeated request can never refund twice. Square accepts refunds
 * as PENDING and completes them asynchronously; REJECTED or FAILED means no money moved.
 */
export async function refundPayment(
  config: SquareConfig,
  {
    paymentId,
    amount,
    idempotencyKey,
    reason,
  }: {
    paymentId: string;
    amount: number;
    idempotencyKey: string;
    reason: string;
  }
): Promise<{ ok: true; refundId: string; status: string } | { ok: false; error: string }> {
  const result = await squareRequest<{ refund: { id: string; status: string } }>(config, '/refunds', {
    idempotency_key: idempotencyKey,
    payment_id: paymentId,
    amount_money: { amount: Math.round(amount * 100), currency: 'USD' },
    reason,
  });
  if (!result.ok) return { ok: false, error: result.error };
  const { id, status } = result.data.refund;
  if (status === 'REJECTED' || status === 'FAILED') {
    return { ok: false, error: `Square refund status ${status}` };
  }
  return { ok: true, refundId: id, status };
}

export interface SquareCardSummary {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  /** Same physical card saved more than once (one copy per booking) shares a fingerprint */
  fingerprint: string;
}

/**
 * Lists a Square customer's active saved cards, for the Billing page (SEC-21).
 */
export async function listCustomerCards(
  config: SquareConfig,
  squareCustomerId: string
): Promise<{ ok: true; cards: SquareCardSummary[] } | { ok: false; error: string }> {
  const result = await squareRequest<{
    cards?: Array<{
      id: string;
      card_brand?: string;
      last_4?: string;
      exp_month?: number;
      exp_year?: number;
      enabled?: boolean;
      fingerprint?: string;
    }>;
  }>(config, `/cards?customer_id=${encodeURIComponent(squareCustomerId)}`, undefined, 'GET');
  if (!result.ok) return { ok: false, error: result.error };
  const cards = (result.data.cards || [])
    .filter((card) => card.enabled !== false)
    .map((card) => ({
      id: card.id,
      brand: (card.card_brand || 'card').toLowerCase(),
      last4: card.last_4 || '••••',
      exp_month: card.exp_month || 0,
      exp_year: card.exp_year || 0,
      fingerprint: card.fingerprint || `${card.card_brand}-${card.last_4}-${card.exp_month}-${card.exp_year}`,
    }));
  return { ok: true, cards };
}

/**
 * Disables (removes) a saved card with Square (SEC-21).
 */
export async function disableCard(
  config: SquareConfig,
  cardId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await squareRequest<{ card: { id: string } }>(config, `/cards/${encodeURIComponent(cardId)}/disable`, {});
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
