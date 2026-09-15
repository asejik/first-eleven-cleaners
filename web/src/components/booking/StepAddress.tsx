import { Card, Input, Button } from '@/components/ui';
import { SmsConsentBlock } from '@/components/compliance';
import { resolveZoneByZip, type ZoneConfig } from '@/lib/constants';
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
  onZoneChange: (zone: ZoneConfig | null) => void;
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
  onZoneChange,
  isValid,
  onContinue,
}: StepAddressProps) {
  const handleZipChange = (val: string) => {
    setZip(val);
    const resolved = resolveZoneByZip(val);
    onZoneChange(resolved);
    if (resolved && (!city || city === 'Dallas')) {
      if (resolved.id === 'zone_3') setCity('Fort Worth');
      else if (resolved.id === 'zone_2') setCity('Plano');
      else if (resolved.id === 'zone_4') setCity('Denton');
      else if (resolved.id === 'zone_1') setCity('Dallas');
    }
  };

  const cleanedZip = (zip || '').trim().replace(/[^\d]/g, '');

  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>Where Should We Pick Up?</h1>
      <p className={styles.cardSubtitle}>
        Door-to-door coverage across the Dallas-Fort Worth Metroplex. Free delivery everywhere.
      </p>

      <div className={styles.formGrid}>
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Dr. Alex Morgan"
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@example.com"
          required
        />
        <div>
          <Input
            label="Mobile Phone"
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
          label="Street Address"
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
            label="City"
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
            label="ZIP Code"
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

      {/* Dynamic Zone Detection Card (Only shown when 5-digit ZIP matches a recognized zone) */}
      {cleanedZip.length >= 5 && detectedZone && (
        <div className={styles.zoneBanner}>
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
                $0.00 (Always Free)
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
                {detectedZone.expressEligible ? '⚡ Eligible' : 'Standard 48-Hr'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Out of Service Area Alert (Shown when 5-digit ZIP is entered but outside North Texas) */}
      {cleanedZip.length >= 5 && !detectedZone && (
        <div className={styles.zoneOutOfArea}>
          <span style={{ fontSize: '24px', lineHeight: 1 }}>📍</span>
          <div>
            <div className={styles.zoneOutOfAreaTitle}>
              Outside Service Area ({zip.trim()})
            </div>
            <div className={styles.zoneOutOfAreaText}>
              First Eleven Cleaners currently operates daily plant routes throughout the Dallas–Fort Worth Metroplex and North Texas (covering ZIP codes starting with 750–754 and 760–762). The ZIP code you entered is outside our delivery area. Please verify your ZIP code or contact our concierge for corporate or commercial laundry inquiries.
            </div>
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
          <strong>Smart Coverage Promise:</strong> No restrictive ZIP fences. We serve all of North Texas with $0 delivery fees. Order minimums scale fairly by zone to power reliable plant routes.
        </div>
      </div>

      <div className={styles.actionRow}>
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={!isValid}
        >
          Continue to Garments →
        </Button>
      </div>
    </Card>
  );
}
