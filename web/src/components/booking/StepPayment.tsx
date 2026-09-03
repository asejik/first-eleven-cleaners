'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';
import { Card, Input, Button } from '@/components/ui';
import styles from './StepPayment.module.css';

interface SquareCardTokenResult {
  status: 'OK' | 'Error';
  token?: string;
  details?: {
    card?: {
      brand?: string;
      last4?: string;
      expMonth?: number;
      expYear?: number;
    };
  };
  errors?: Array<{ message: string }>;
}

interface SquareCardInstance {
  attach: (container: string | HTMLElement) => Promise<void>;
  tokenize: () => Promise<SquareCardTokenResult>;
  destroy: () => Promise<void>;
}

interface SquarePayments {
  card: (options?: Record<string, unknown>) => Promise<SquareCardInstance>;
}

declare global {
  interface Window {
    Square?: {
      payments: (appId: string, locationId: string) => SquarePayments;
    };
  }
}

interface StepPaymentProps {
  serviceType: 'dry_clean' | 'wash_fold' | 'mixed';
  cardNumber: string;
  setCardNumber: (val: string) => void;
  cardExpiry: string;
  setCardExpiry: (val: string) => void;
  cardCvc: string;
  setCardCvc: (val: string) => void;
  total: number;
  isLoading: boolean;
  onBack: () => void;
  onCompleteBooking: (paymentToken?: string, cardBrand?: string, last4?: string) => void;
}

export function StepPayment({
  serviceType,
  cardNumber,
  setCardNumber,
  cardExpiry,
  setCardExpiry,
  cardCvc,
  setCardCvc,
  total,
  isLoading,
  onBack,
  onCompleteBooking,
}: StepPaymentProps) {
  const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID || '';
  const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID || '';
  const isSandbox = appId.startsWith('sandbox-');
  const sdkUrl = isSandbox
    ? 'https://sandbox.web.squarecdn.com/v1/square.js'
    : 'https://web.squarecdn.com/v1/square.js';

  const [isSdkLoaded, setIsSdkLoaded] = useState(false);
  const [isSquareReady, setIsSquareReady] = useState(false);
  const [isTokenizing, setIsTokenizing] = useState(false);
  const [squareError, setSquareError] = useState<string | null>(null);

  const cardInstanceRef = useRef<SquareCardInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);

  // Initialize Square card once SDK script is loaded and container is mounted
  useEffect(() => {
    if (!isSdkLoaded || !appId || !locationId || initializedRef.current) {
      return;
    }

    let isMounted = true;

    async function initSquareCard() {
      try {
        if (!window.Square) {
          throw new Error('Square Web Payments SDK is not available.');
        }

        if (!containerRef.current) {
          throw new Error('Square container ref is not mounted.');
        }

        containerRef.current.innerHTML = '';

        const payments = window.Square.payments(appId, locationId);
        const card = await payments.card();

        if (!isMounted) {
          await card.destroy();
          return;
        }

        await card.attach(containerRef.current);
        cardInstanceRef.current = card;
        initializedRef.current = true;
        setIsSquareReady(true);
      } catch (err: unknown) {
        console.warn('Square Web Payments SDK initialization notice:', err);
        if (isMounted) {
          setSquareError((err as Error).message || 'Could not mount Square secure card form.');
        }
      }
    }

    initSquareCard();

    return () => {
      isMounted = false;
      if (cardInstanceRef.current) {
        cardInstanceRef.current.destroy().catch(() => {});
        cardInstanceRef.current = null;
        initializedRef.current = false;
      }
    };
  }, [isSdkLoaded, appId, locationId]);

  const handleSubmit = async () => {
    setSquareError(null);

    // If Square card is mounted and active, tokenize via Square
    if (isSquareReady && cardInstanceRef.current) {
      try {
        setIsTokenizing(true);
        const result = await cardInstanceRef.current.tokenize();

        if (result.status === 'OK' && result.token) {
          const brand = result.details?.card?.brand || 'card';
          const last4 = result.details?.card?.last4 || '4242';
          onCompleteBooking(result.token, brand, last4);
        } else {
          const errorMsg =
            result.errors?.[0]?.message || 'Please check your card details and try again.';
          setSquareError(errorMsg);
        }
      } catch (err: unknown) {
        setSquareError((err as Error).message || 'Card authorization failed.');
      } finally {
        setIsTokenizing(false);
      }
      return;
    }

    // Fallback: manual simulated submission if Square is not configured or in offline mode
    onCompleteBooking(undefined, 'visa', cardNumber ? cardNumber.slice(-4) : '4242');
  };

  const hasSquareConfig = Boolean(appId && locationId);

  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      {hasSquareConfig && (
        <Script
          src={sdkUrl}
          strategy="afterInteractive"
          onLoad={() => setIsSdkLoaded(true)}
          onError={() => setSquareError('Failed to load Square Payments SDK.')}
        />
      )}

      <h1 className={styles.cardTitle}>Set Up Invisible Checkout</h1>
      <p className={styles.cardSubtitle}>
        Secure card on file — charged transparently only after intake &amp; photo inspection.
      </p>

      <div className={styles.seeItPayItCallout}>
        <span className={styles.calloutIcon}>📸</span>
        <div>
          <strong>&quot;See It, Then Pay It&quot; Promise:</strong>
          <p className={styles.calloutText}>
            {serviceType === 'mixed'
              ? 'For Mixed Orders (Wash & Fold + Dry Cleaning), your card is vaulted securely. Our intake team counts your dry clean pieces and weighs your laundry on calibrated scales. You receive full photo verification before the single consolidated charge lands.'
              : serviceType === 'wash_fold'
              ? 'For Wash & Fold, your card is held securely on file. Our intake team weighs and photographs your clothes, and sends your digital photo receipt before the charge lands. Zero surprise fees.'
              : 'Your card is vaulted securely with Square. Garments are inspected and photographed at intake under our Carvana-Standard Garment Passport™ before final processing.'}
          </p>
        </div>
      </div>

      <div className={styles.cardVaultBox}>
        <div className={styles.cardHeaderSmall}>
          <span>🔒 Powered by Square Web Payments</span>
          <span className={styles.badgeSecure}>256-Bit Encrypted (PCI-DSS)</span>
        </div>

        {hasSquareConfig ? (
          <div>
            {/* Loading Indicator while Square SDK loads */}
            {!isSquareReady && !squareError && (
              <div className={styles.squareLoading}>
                <span className={styles.spinner} />
                <span>Initializing secure Square payment vault...</span>
              </div>
            )}

            {/* Square SDK Container — Rendered in DOM with min-height so Square can measure layout */}
            <div
              id="square-card-container"
              ref={containerRef}
              className={styles.squareContainer}
              style={{
                display: isSquareReady ? 'block' : squareError ? 'none' : 'block',
                minHeight: '95px',
              }}
            />

            {squareError && (
              <div className={styles.errorMessage}>
                ⚠️ {squareError}
              </div>
            )}
          </div>
        ) : (
          /* Graceful Fallback if Square credentials are not configured */
          <div>
            <Input
              label="Card Number"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="4111 2222 3333 4444"
            />
            <div className={styles.rowTwo} style={{ marginTop: 'var(--space-3)' }}>
              <Input
                label="Expires"
                value={cardExpiry}
                onChange={(e) => setCardExpiry(e.target.value)}
                placeholder="MM/YY"
              />
              <Input
                label="CVC"
                value={cardCvc}
                onChange={(e) => setCardCvc(e.target.value)}
                placeholder="CVC"
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.buttonSplit}>
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          isLoading={isLoading || isTokenizing}
          disabled={hasSquareConfig && !isSquareReady && !squareError}
        >
          Confirm Pickup (${total.toFixed(2)})
        </Button>
      </div>
    </Card>
  );
}
