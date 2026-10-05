'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@/components/ui';
import { SUPPORT_PHONE } from '@/lib/constants';

/**
 * Lets a customer pay an order on Payment Hold with a new card (P03 PR-04). The card is
 * tokenized by Square's own form (card numbers never touch our servers); the server saves it
 * and charges the order's stored total.
 */
interface SquareCard {
  attach: (container: HTMLElement) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>;
  destroy: () => Promise<void>;
}

export function PayNowCard({ orderId, amountDue }: { orderId: string; amountDue: number }) {
  const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID || '';
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || '';
  const sdkUrl = appId.startsWith('sandbox-')
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';

  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<SquareCard | null>(null);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (!sdkLoaded || !appId || !locationId || !containerRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const square = (window as unknown as { Square?: { payments: (a: string, l: string) => { card: () => Promise<SquareCard> } } }).Square;
        if (!square) throw new Error('Square is not available.');
        const card = await square.payments(appId, locationId).card();
        if (cancelled) {
          await card.destroy();
          return;
        }
        if (containerRef.current) containerRef.current.innerHTML = '';
        await card.attach(containerRef.current as HTMLElement);
        cardRef.current = card;
        setReady(true);
      } catch {
        if (!cancelled) setError('The secure card form could not load. Please refresh the page or call us.');
      }
    })();
    return () => {
      cancelled = true;
      cardRef.current?.destroy().catch(() => {});
      cardRef.current = null;
    };
  }, [sdkLoaded, appId, locationId]);

  const handlePay = async () => {
    if (!cardRef.current) return;
    setError(null);
    setIsPaying(true);
    try {
      const tokenResult = await cardRef.current.tokenize();
      if (tokenResult.status !== 'OK' || !tokenResult.token) {
        throw new Error(tokenResult.errors?.[0]?.message || 'Please check your card details.');
      }
      const res = await fetch(`/api/orders/${orderId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ card_token: tokenResult.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The payment did not go through. Please try another card.');
      setPaid(true);
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsPaying(false);
    }
  };

  if (paid) {
    return (
      <Card variant="bordered" padding="lg" style={{ marginBottom: 'var(--space-6)' }}>
        <strong>✅ Payment received. Thank you!</strong>
        <p style={{ margin: 'var(--space-2) 0 0' }}>Your order is back on schedule.</p>
      </Card>
    );
  }

  return (
    <Card variant="bordered" padding="lg" style={{ marginBottom: 'var(--space-6)', borderColor: 'rgba(239, 68, 68, 0.45)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Payment needed: ${amountDue.toFixed(2)}</h2>
      <p style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
        Your card on file was declined, so your order is on hold. Pay securely below and we&apos;ll start cleaning right away.
      </p>

      {appId && locationId ? (
        <>
          <Script src={sdkUrl} strategy="afterInteractive" onLoad={() => setSdkLoaded(true)} onReady={() => setSdkLoaded(true)} />
          <div ref={containerRef} style={{ minHeight: '90px' }} aria-label="Secure card form" />
          <Button variant="primary" fullWidth onClick={handlePay} disabled={!ready || isPaying} style={{ marginTop: 'var(--space-3)' }}>
            {isPaying ? 'Processing…' : `Pay $${amountDue.toFixed(2)}`}
          </Button>
        </>
      ) : (
        <p>Online payment is unavailable right now. Please call us at {SUPPORT_PHONE} to pay by phone.</p>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--color-error)', margin: 'var(--space-3) 0 0' }}>
          {error}
        </p>
      )}
      <p style={{ fontSize: 'var(--text-xs)', margin: 'var(--space-3) 0 0', opacity: 0.8 }}>
        Card details are handled by Square. Questions? Call {SUPPORT_PHONE}.
      </p>
    </Card>
  );
}
