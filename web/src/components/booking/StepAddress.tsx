import { useState } from 'react';
import { Card, Input, Button } from '@/components/ui';
import { SmsConsentBlock } from '@/components/compliance';
import { resolveZoneByZip, ROUTES, EXTENDED_REACH_LABEL, type ZoneConfig } from '@/lib/constants';
import { formatLongDate, type ExtendedReachQuote } from '@/lib/coverage';
import type { AddressCoverage } from '@/hooks/useCoverage';
import styles from '@/app/book/page.module.css';

interface StepAddressProps {
  fullName: string;
  setFullName: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  smsConsent: boolean;
  setSmsConsent: (val: boolean) => void;
  smsPromotionsConsent: boolean;
  setSmsPromotionsConsent: (val: boolean) => void;
  street: string;
  setStreet: (val: string) => void;
  unit: string;
  setUnit: (val: string) => void;
  city: string;
  setCity: (val: string) => void;
  zip: string;
  setZip: (val: string) => void;
  deliveryNotes: string;
  setDeliveryNotes: (val: string) => void;
  detectedZone: ZoneConfig | null;
  /** Where the address is served: ZIP lists, or driving distance (client 2026-10-07, 8A) */
  addressCoverage: AddressCoverage;
  /** Zone 5: the fee, Routine price and the next runs */
  extendedReach: ExtendedReachQuote | null;
  isRoutine: boolean;
  onJoinRoutine: () => void;
  /** "Extended Reach begins ..." / "coming soon": shown to Zone 5 addresses before the first run */
  extendedReachStart: string;
  isValid: boolean;
  onContinue: () => void;
}

export function StepAddress({
  fullName,
  setFullName,
  email,
  setEmail,
  phone,
  setPhone,
  smsConsent,
  setSmsConsent,
  smsPromotionsConsent,
  setSmsPromotionsConsent,
  street,
  setStreet,
  unit,
  setUnit,
  city,
  setCity,
  zip,
  setZip,
  deliveryNotes,
  setDeliveryNotes,
  detectedZone,
  addressCoverage,
  extendedReach,
  isRoutine,
  onJoinRoutine,
  extendedReachStart,
  isValid,
  onContinue,
}: StepAddressProps) {
  const handleZipChange = (val: string) => {
    setZip(val);
    // A likely city for the ZIP; the zone itself comes from addressCoverage
    const resolved = resolveZoneByZip(val);
    if (resolved && (!city || city === 'Dallas')) {
      if (resolved.id === 'zone_3') setCity('Fort Worth');
      else if (resolved.id === 'zone_2') setCity('Plano');
      else if (resolved.id === 'zone_4') setCity('Denton');
      else if (resolved.id === 'zone_1') setCity('Dallas');
    }
  };

  const cleanedZip = (zip || '').trim().replace(/[^\d]/g, '');
  const isWaitlist = addressCoverage.resolution.status === 'waitlist';
  const zone5NotStarted = addressCoverage.resolution.status === 'waitlist' && addressCoverage.resolution.reason === 'zone5_not_started';
  const nextRun = extendedReach?.runs[0];

  // "Not in your area yet": join the waitlist with the contact details above (client 8C)
  const [waitlist, setWaitlist] = useState<{ state: 'idle' | 'sending' | 'done' | 'error'; message?: string }>({ state: 'idle' });
  const joinWaitlist = async () => {
    setWaitlist({ state: 'sending' });
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName || undefined, email, phone, street, city, zip, source: 'booking', sms_consent: smsConsent }),
      });
      const data = await res.json();
      setWaitlist(res.ok ? { state: 'done', message: data.message } : { state: 'error', message: data.error });
    } catch {
      setWaitlist({ state: 'error', message: 'Could not join the waitlist. Please try again.' });
    }
  };

  // Continue stays enabled: a dimmed button gives screen-reader users no reason. On
  // press, missing fields show an error (announced by Input) and get focus (SR-02).
  const [showErrors, setShowErrors] = useState(false);
  const fieldErrors: [id: string, message: string | null][] = [
    ['booking-full-name', fullName.trim() ? null : 'Enter your full name.'],
    ['booking-email', email.trim() ? null : 'Enter your email address.'],
    ['booking-phone', phone.trim() ? null : 'Enter your mobile phone number.'],
    ['booking-street', street.trim() ? null : 'Enter your street address.'],
    ['booking-city', city.trim() ? null : 'Enter your city.'],
    ['booking-zip', cleanedZip.length < 5 ? 'Enter your 5-digit ZIP code.' : detectedZone ? null : addressCoverage.checking ? 'Checking your address\u2026' : 'We don\u2019t serve this address yet.'],
  ];
  const errorFor = (id: string) => (showErrors ? fieldErrors.find(([f]) => f === id)?.[1] ?? undefined : undefined);

  const handleContinue = () => {
    if (isValid) {
      onContinue();
      return;
    }
    setShowErrors(true);
    const firstInvalid = fieldErrors.find(([, message]) => message)?.[0];
    if (firstInvalid) requestAnimationFrame(() => document.getElementById(firstInvalid)?.focus());
  };

  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>Where Should We Pick Up?</h1>
      <p className={styles.cardSubtitle}>
        Door-to-door courier delivery is complimentary across the entire DFW Metroplex.
      </p>

      <div className={styles.formGrid}>
        <Input
          id="booking-full-name"
          label="Full Name"
          error={errorFor('booking-full-name')}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Dr. Alex Morgan"
          required
        />
        <Input
          id="booking-email"
          label="Email"
          error={errorFor('booking-email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@example.com"
          required
        />
        <div>
          <Input
            id="booking-phone"
            label="Mobile Phone"
            error={errorFor('booking-phone')}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(214) 555-0199"
            required
            helperText="Used for driver coordination, dispatch alerts, and contactless delivery receipts"
          />
          <SmsConsentBlock
            smsConsent={smsConsent}
            onSmsConsentChange={setSmsConsent}
            smsPromotionsConsent={smsPromotionsConsent}
            onSmsPromotionsConsentChange={setSmsPromotionsConsent}
            idPrefix="booking_step1"
          />
        </div>
        <Input
          id="booking-street"
          label="Street Address"
          error={errorFor('booking-street')}
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="4514 Travis St"
          required
        />
        <div className={styles.rowTwo}>
          <Input
            label="Apt / Suite / Gate Code"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Apt 304, Gate #1100"
          />
          <Input
            id="booking-city"
            label="City"
            error={errorFor('booking-city')}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Dallas"
            required
          />
        </div>
        <div className={styles.rowTwo}>
          <Input
            label="State"
            value="TX"
            disabled
            required
          />
          <Input
            id="booking-zip"
            label="ZIP Code"
            error={errorFor('booking-zip')}
            value={zip}
            onChange={(e) => handleZipChange(e.target.value)}
            placeholder="75205"
            required
            helperText="Enter 5-digit ZIP to verify area coverage & route schedule"
          />
        </div>
        <Input
          label="Delivery & Porch Instructions (Optional)"
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Leave on front porch behind planter, or with building concierge"
        />
      </div>

      {cleanedZip.length >= 5 && addressCoverage.checking && !detectedZone && !isWaitlist && (
        <div className={styles.zonePrompt} role="status">
          <span style={{ fontSize: '20px' }}>📍</span>
          <div>Checking your address&hellip;</div>
        </div>
      )}

      {/* Zone card: shown once the address resolves */}
      {cleanedZip.length >= 5 && detectedZone && (
        <div className={styles.zoneBanner} role="status">
          <div className={styles.zoneBannerHeader}>
            <div className={styles.zoneBannerTitle}>
              <span>📍 {detectedZone.name}</span>
            </div>
            <span className={styles.zoneBadgePill}>{detectedZone.badge}</span>
          </div>
          <p className={styles.zoneTagline}>{detectedZone.tagline}</p>

          <div className={styles.zoneSpecsGrid}>
            <div className={styles.zoneSpecItem}>
              <span className={styles.zoneSpecLabel}>Order Minimum</span>
              <span className={`${styles.zoneSpecValue} ${styles.zoneSpecHighlight}`}>
                ${detectedZone.minimumOrder.toFixed(0)} min
              </span>
            </div>
            <div className={styles.zoneSpecItem}>
              <span className={styles.zoneSpecLabel}>Delivery Fee</span>
              <span className={`${styles.zoneSpecValue} ${styles.zoneSpecHighlight}`}>
                {extendedReach
                  ? `$${(isRoutine ? extendedReach.routineFee : extendedReach.fullFee).toFixed(2)}`
                  : '$0.00 (Always Free)'}
              </span>
            </div>
            <div className={styles.zoneSpecItem}>
              <span className={styles.zoneSpecLabel}>Route Schedule</span>
              <span className={styles.zoneSpecValue}>{detectedZone.routeScheduleLabel}</span>
            </div>
            <div className={styles.zoneSpecItem}>
              <span className={styles.zoneSpecLabel}>24-Hr Express</span>
              <span
                className={`${styles.zoneSpecValue} ${
                  detectedZone.expressEligible ? styles.zoneSpecHighlight : styles.zoneSpecMuted
                }`}
              >
                {detectedZone.expressEligible ? '⚡ Mon–Thu' : 'Standard 48-Hr'}
              </span>
            </div>
          </div>

          {/* Zone 5: the fee as its own line, the Routine price, and the route threshold */}
          {extendedReach && (
            <div className={styles.extendedReachBox}>
              <div className={styles.extendedReachLine}>
                <span>{EXTENDED_REACH_LABEL}</span>
                <strong>
                  {isRoutine ? (
                    <>
                      <s>${extendedReach.fullFee.toFixed(2)}</s> ${extendedReach.routineFee.toFixed(2)} (Routine member)
                    </>
                  ) : (
                    `$${extendedReach.fullFee.toFixed(2)}`
                  )}
                </strong>
              </div>
              {!isRoutine && (
                <div className={styles.extendedReachRoutine}>
                  <span>
                    {EXTENDED_REACH_LABEL}: ${extendedReach.fullFee.toFixed(0)} → ${extendedReach.routineFee.toFixed(2)} for Routine members
                  </span>
                  <Button variant="outline" size="sm" onClick={onJoinRoutine}>
                    Join the Routine
                  </Button>
                </div>
              )}
              <p className={styles.extendedReachNote}>
                ${extendedReach.minimumOrder.toFixed(0)} order minimum, plus the delivery fee. Tax and the environmental fee apply to the delivery fee like any line.
                {' '}{extendedReach.turnaround}
                {nextRun && (
                  <>
                    {' '}Next route: {formatLongDate(nextRun.date)}.{' '}
                    {nextRun.dispatched
                      ? 'This route is confirmed.'
                      : `Your route runs when ${nextRun.threshold} neighbors book. Currently ${Math.min(nextRun.booked, nextRun.threshold)} of ${nextRun.threshold}.`}
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Beyond the last Extended Reach band, or outside North Texas: the waitlist */}
      {cleanedZip.length >= 5 && isWaitlist && (
        <div className={styles.zoneOutOfArea} role="status">
          <span style={{ fontSize: '24px', lineHeight: 1 }}>📍</span>
          <div>
            <div className={styles.zoneOutOfAreaTitle}>{zone5NotStarted ? 'Extended Reach' : 'Not in your area yet'}</div>
            <div className={styles.zoneOutOfAreaText}>
              {zone5NotStarted
                ? `${extendedReachStart} Join the waitlist to hear when your route opens.`
                : "This address is beyond our delivery routes for now. Join the waitlist and we'll let you know as soon as we reach you."}
            </div>
            {waitlist.state === 'done' ? (
              <p className={styles.zoneOutOfAreaText} style={{ marginTop: 'var(--space-2)', fontWeight: 700 }}>
                ✅ {waitlist.message}
              </p>
            ) : (
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={joinWaitlist}
                  disabled={waitlist.state === 'sending' || !(email.trim() || phone.trim())}
                >
                  {waitlist.state === 'sending' ? 'Joining…' : 'Join the waitlist'}
                </Button>
                {!(email.trim() || phone.trim()) && (
                  <p className={styles.zoneOutOfAreaText} style={{ marginTop: 'var(--space-2)' }}>
                    Enter your email or phone above so we can tell you.
                  </p>
                )}
                {waitlist.state === 'error' && (
                  <p className={styles.zoneOutOfAreaText} role="alert" style={{ marginTop: 'var(--space-2)' }}>
                    {waitlist.message}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Neutral Prompt (Shown when ZIP is empty or incomplete) */}
      {cleanedZip.length < 5 && (
        <div className={styles.zonePrompt}>
          <span style={{ fontSize: '20px' }}>📍</span>
          <div>
            {cleanedZip.length === 0
              ? 'Enter your 5-digit ZIP code above to verify area coverage, route schedule, and order minimum.'
              : `Enter all 5 digits of your ZIP code (${cleanedZip.length}/5 digits entered).`}
          </div>
        </div>
      )}

      <div className={styles.smartCoverageNotice}>
        <span className={styles.noticeEmoji}>🗺️</span>
        <div>
          <strong>Smart Coverage Promise:</strong> Door-to-door courier delivery is complimentary across the entire DFW Metroplex. Order minimums scale fairly by zone to power reliable plant routes. Beyond the Metroplex?{' '}
          <a href={`${ROUTES.serviceAreas}#extended-reach`}>See Extended Reach.</a>
        </div>
      </div>

      <div className={styles.actionRow}>
        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
        >
          Continue to Garments →
        </Button>
      </div>
    </Card>
  );
}
