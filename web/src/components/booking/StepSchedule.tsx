import { Card, Input, Badge, Button } from '@/components/ui';
import type { ZoneConfig } from '@/lib/constants';
import styles from '@/app/book/page.module.css';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

function getNextValidRouteDate(baseDate: Date, routeDays: string[]): Date {
  const d = new Date(baseDate);
  for (let i = 0; i < 14; i++) {
    const dayName = DAY_NAMES[d.getDay()];
    if (routeDays.includes(dayName)) {
      return d;
    }
    d.setDate(d.getDate() + 1);
  }
  return d;
}

interface StepScheduleProps {
  expressTier: 'standard' | 'express_24hr';
  handleSelectTier: (tier: 'standard' | 'express_24hr') => void;
  pickupDate: string;
  setPickupDate: (val: string) => void;
  pickupWindow: 'morning' | 'evening';
  setPickupWindow: (val: 'morning' | 'evening') => void;
  frequency: 'one_time' | 'weekly' | 'biweekly';
  setFrequency: (val: 'one_time' | 'weekly' | 'biweekly') => void;
  slotData: { is_available?: boolean; reason?: string } | undefined;
  getMinPickupDate: (tier?: 'standard' | 'express_24hr') => string;
  formatDisplayDate: (dateStr: string) => string;
  formatLocalDate: (d: Date) => string;
  getEstimatedDeliveryDate: (pickupDateStr: string, tier?: 'standard' | 'express_24hr') => string;
  onToast: (toast: { type: 'warning' | 'info' | 'error' | 'success'; title: string; message: string }) => void;
  hasExcludedGarments?: boolean;
  isExpressCapacityFull?: boolean;
  nextAvailableExpressDate?: string;
  detectedZone?: ZoneConfig | null;
  isValid: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function StepSchedule({
  expressTier,
  handleSelectTier,
  pickupDate,
  setPickupDate,
  pickupWindow,
  setPickupWindow,
  frequency,
  setFrequency,
  slotData,
  getMinPickupDate,
  formatDisplayDate,
  formatLocalDate,
  getEstimatedDeliveryDate,
  onToast,
  hasExcludedGarments = false,
  isExpressCapacityFull = false,
  nextAvailableExpressDate = '',
  detectedZone,
  isValid,
  onBack,
  onContinue,
}: StepScheduleProps) {
  const [py, pm, pd] = pickupDate ? pickupDate.split('-').map(Number) : [0, 0, 0];
  const selectedDay = new Date(py, pm - 1, pd).getDay();
  const isPickupMonFri = selectedDay >= 1 && selectedDay <= 5;
  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>When Should We Pick Up?</h1>
      <p className={styles.cardSubtitle}>
        {detectedZone?.name || 'Dallas-Fort Worth'} · {detectedZone?.routeScheduleLabel || 'Daily Plant Routes'}
      </p>

      <div className={styles.scheduleBox}>
        <Input
          label="Pickup Date"
          type="date"
          value={pickupDate}
          min={getMinPickupDate(expressTier)}
          onChange={(e) => {
            const val = e.target.value;
            const minVal = getMinPickupDate(expressTier);
            if (!val) return;
            if (val < minVal) {
              setPickupDate(minVal);
              onToast({
                type: 'warning',
                title: 'Advance Schedule Rule',
                message: `${expressTier === 'standard' ? '48-Hour Standard' : 'Express'} service requires advance booking. Earliest available pickup is ${formatDisplayDate(minVal)}.`,
              });
              return;
            }
            const [y, m, d] = val.split('-').map(Number);
            const chosenDate = new Date(y, m - 1, d);
            const chosenDayName = DAY_NAMES[chosenDate.getDay()];

            // Check if day matches zone's scheduled route days
            if (detectedZone && !detectedZone.routeDays.includes(chosenDayName as any)) {
              const nextValid = getNextValidRouteDate(chosenDate, detectedZone.routeDays);
              const nextValidStr = formatLocalDate(nextValid);
              setPickupDate(nextValidStr);
              onToast({
                type: 'warning',
                title: `${detectedZone.name} Route Schedule`,
                message: `${detectedZone.name} routes run on ${detectedZone.routeScheduleLabel}. We've moved your pickup to the next available route day: ${formatDisplayDate(nextValidStr)}.`,
              });
              return;
            }
            setPickupDate(val);
          }}
          helperText={
            expressTier === 'standard'
              ? `📅 ${detectedZone?.name || 'DFW'}: ${detectedZone?.routeScheduleLabel || 'Daily Routes'}. Earliest pickup is ${formatDisplayDate(getMinPickupDate('standard'))}.`
              : `⚡ 24-Hour Express: Tomorrow morning pickup unlocked (${formatDisplayDate(getMinPickupDate('express_24hr'))}).`
          }
          required
        />

        {/* Real-time Turnaround & Delivery Timeline Card */}
        {pickupDate && (
          <div style={{
            background: expressTier === 'express_24hr' ? 'rgba(201, 161, 74, 0.14)' : 'rgba(201, 161, 74, 0.08)',
            border: expressTier === 'express_24hr' ? '2px solid var(--color-gold)' : '1px solid rgba(201, 161, 74, 0.3)',
            borderRadius: 'var(--radius-lg)',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: 'var(--space-4)',
          }}>
            <div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gold-dark)', fontWeight: 'bold', display: 'block' }}>
                {expressTier === 'express_24hr' ? '⚡ 24-Hour Express Guarantee Timeline' : '✨ Match-Ready Guarantee Timeline'}
              </span>
              <strong style={{ fontSize: '14px', color: 'var(--color-navy)', display: 'block', marginTop: '2px' }}>
                Pickup: {formatDisplayDate(pickupDate)} ({pickupWindow === 'morning' ? 'Morning 7:30–10 AM' : 'Evening 5–8 PM'}) → Delivery: {getEstimatedDeliveryDate(pickupDate, expressTier)} ({expressTier === 'express_24hr' ? 'Morning 7:30–10 AM' : (pickupWindow === 'morning' ? 'Morning' : 'Evening')})
              </strong>
            </div>
            <Badge variant={expressTier === 'express_24hr' ? 'gold' : 'success'}>
              {expressTier === 'express_24hr' ? '⚡ Match-Ready Tomorrow' : '🛡️ 48-Hr Match-Ready'}
            </Badge>
          </div>
        )}

        {slotData?.is_available === false && (
          <div className={styles.blackoutAlert}>
            ⚠️ {slotData.reason || 'No pickups available on this date. Please choose another day.'}
          </div>
        )}

        <div className={styles.windowSelection}>
          <label className={styles.fieldLabel}>Select Pickup Window:</label>
          <div className={styles.windowOptions}>
            <button
              type="button"
              className={`${styles.windowCard} ${pickupWindow === 'morning' ? styles.selectedWindow : ''}`}
              onClick={() => setPickupWindow('morning')}
              aria-pressed={pickupWindow === 'morning'}
            >
              <span className={styles.winIcon}>🌅</span>
              <strong>Morning Window</strong>
              <span>7:30 AM – 10:00 AM</span>
            </button>
            <button
              type="button"
              className={`${styles.windowCard} ${pickupWindow === 'evening' ? styles.selectedWindow : ''}`}
              onClick={() => setPickupWindow('evening')}
              aria-pressed={pickupWindow === 'evening'}
            >
              <span className={styles.winIcon}>🌆</span>
              <strong>Evening Window</strong>
              <span>5:00 PM – 8:00 PM</span>
            </button>
          </div>
        </div>

        {/* Pickup Frequency / Subscription Selector */}
        <div className={styles.expressOptionBox} style={{ marginBottom: 'var(--space-4)' }}>
          <div className={styles.expressHeader}>
            <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
              🔄 Pickup Frequency &amp; Savings:
            </label>
            <Badge variant="success">Cancel or Skip Anytime</Badge>
          </div>
          <div className={styles.expressTierOptions}>
            <button
              type="button"
              className={`${styles.tierCard} ${frequency === 'one_time' ? styles.selectedTier : ''}`}
              onClick={() => setFrequency('one_time')}
              aria-pressed={frequency === 'one_time'}
            >
              <span className={styles.tierTitle}>🎯 One-Time</span>
              <span className={styles.tierBadge}>Standard</span>
              <span className={styles.tierDesc}>Single scheduled pickup</span>
            </button>
            <button
              type="button"
              className={`${styles.tierCard} ${frequency === 'weekly' ? styles.selectedTier : ''}`}
              onClick={() => setFrequency('weekly')}
              aria-pressed={frequency === 'weekly'}
            >
              <span className={styles.tierTitle}>⚡ Weekly</span>
              <span className={styles.tierBadge}>Save 10%</span>
              <span className={styles.tierDesc}>Automatic weekly pickup</span>
            </button>
            <button
              type="button"
              className={`${styles.tierCard} ${frequency === 'biweekly' ? styles.selectedTier : ''}`}
              onClick={() => setFrequency('biweekly')}
              aria-pressed={frequency === 'biweekly'}
            >
              <span className={styles.tierTitle}>📅 Bi-Weekly</span>
              <span className={styles.tierBadge}>Save 5%</span>
              <span className={styles.tierDesc}>Every 2 weeks care</span>
            </button>
          </div>
        </div>

        {/* Express Tier Turnaround Speed Selector:
            Offered ONLY in Express-eligible zones (Zone 1 & 2), on Monday–Friday morning windows. */}
        {!detectedZone?.expressEligible ? (
          <div style={{
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderLeft: '4px solid #64748b',
            padding: '12px 16px',
            borderRadius: 'var(--radius-lg)',
            marginTop: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: '#334155',
          }}>
            <strong>⏱️ Standard 48-Hour Care for {detectedZone?.name || 'Your Area'}:</strong> 24-Hour Express is not offered in this zone to protect route consistency and logistics. All pickups in your area receive our signature 48-hour match-ready turnaround.
          </div>
        ) : pickupWindow === 'morning' && isPickupMonFri ? (
          <div className={styles.expressOptionBox}>
            <div className={styles.expressHeader}>
              <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
                ⚡ Turnaround Speed &amp; Processing:
              </label>
              <Badge variant={expressTier === 'express_24hr' ? 'gold' : 'info'}>
                {expressTier === 'express_24hr'
                  ? '⚡ 24-Hour Express (+50%, min $15)'
                  : 'Standard: 48 Hours (Included)'}
              </Badge>
            </div>
            <div className={styles.expressTierOptions}>
              <button
                type="button"
                className={`${styles.tierCard} ${expressTier === 'standard' ? styles.selectedTier : ''}`}
                onClick={() => handleSelectTier('standard')}
                aria-pressed={expressTier === 'standard'}
              >
                <span className={styles.tierTitle}>48-Hr Standard</span>
                <span className={styles.tierBadge}>Included</span>
                <span className={styles.tierDesc}>Match-ready in 48 hours</span>
              </button>
              <button
                type="button"
                className={`${styles.tierCard} ${expressTier === 'express_24hr' ? styles.selectedTier : ''}`}
                onClick={() => {
                  if (!hasExcludedGarments && !isExpressCapacityFull) {
                    handleSelectTier('express_24hr');
                  }
                }}
                disabled={hasExcludedGarments || isExpressCapacityFull}
                aria-pressed={expressTier === 'express_24hr'}
                style={hasExcludedGarments || isExpressCapacityFull ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
              >
                <span className={styles.tierTitle}>⚡ 24-Hr Express</span>
                <span className={styles.tierBadge}>+50% (min $15)</span>
                <span className={styles.tierDesc}>Match-Ready Tomorrow Morning</span>
              </button>
            </div>

            {hasExcludedGarments && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: '#92400E', background: '#FEF3C7', borderLeft: '3px solid #D97706', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                Specialty items need our full care timeline — Express isn&apos;t available for this order.
              </div>
            )}

            {isExpressCapacityFull && !hasExcludedGarments && (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-navy)', background: 'rgba(201, 161, 74, 0.15)', borderLeft: '3px solid var(--color-gold)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                Express is full for tomorrow — next available: {nextAvailableExpressDate}.
              </div>
            )}

            {!hasExcludedGarments && !isExpressCapacityFull && (
              <p className={styles.expressNote} style={{ marginTop: 'var(--space-2)' }}>
                {expressTier === 'express_24hr'
                  ? '🛡️ On-Time Guarantee: Miss the 10:00 AM delivery window, and the Express fee refunds itself automatically.'
                  : 'All orders include contactless porch pickup/delivery with photo-verified chain of custody.'}
              </p>
            )}
          </div>
        ) : (
          <div style={{ background: 'var(--color-cream)', padding: '12px 16px', borderRadius: 'var(--radius-lg)', marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)' }}>
            ℹ️ Standard 48-hour care applies. 24-Hour Express is offered on Monday–Friday morning pickup windows.
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
          onClick={onContinue}
          disabled={!isValid}
        >
          Review Order & Pricing →
        </Button>
      </div>
    </Card>
  );
}
