import { Card, Input, Badge, Button } from '@/components/ui';
import styles from '@/app/book/page.module.css';

interface StepScheduleProps {
  expressTier: 'standard' | 'express_8hr' | 'express_4hr';
  handleSelectTier: (tier: 'standard' | 'express_8hr' | 'express_4hr') => void;
  pickupDate: string;
  setPickupDate: (val: string) => void;
  pickupWindow: 'morning' | 'evening';
  setPickupWindow: (val: 'morning' | 'evening') => void;
  frequency: 'one_time' | 'weekly' | 'biweekly';
  setFrequency: (val: 'one_time' | 'weekly' | 'biweekly') => void;
  slotData: { is_available?: boolean; reason?: string } | undefined;
  getMinPickupDate: (tier?: 'standard' | 'express_8hr' | 'express_4hr') => string;
  formatDisplayDate: (dateStr: string) => string;
  formatLocalDate: (d: Date) => string;
  getEstimatedDeliveryDate: (pickupDateStr: string, tier?: 'standard' | 'express_8hr' | 'express_4hr') => string;
  onToast: (toast: { type: 'warning' | 'info' | 'error' | 'success'; title: string; message: string }) => void;
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
  isValid,
  onBack,
  onContinue,
}: StepScheduleProps) {
  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>When Should We Pick Up?</h1>
      <p className={styles.cardSubtitle}>
        48-Hour Match-Ready Turnaround. Operating Monday through Saturday.
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
                title: '48-Hour Turnaround Rule',
                message: `${expressTier === 'standard' ? '48-Hour Standard' : 'Express'} service requires advance booking. Earliest available pickup is ${formatDisplayDate(minVal)}.`,
              });
              return;
            }
            const [y, m, d] = val.split('-').map(Number);
            const selectedDay = new Date(y, m - 1, d).getDay();
            if (selectedDay === 0) {
              const monday = new Date(y, m - 1, d + 1);
              const mondayStr = formatLocalDate(monday);
              setPickupDate(mondayStr);
              onToast({
                type: 'warning',
                title: 'Plant Closed Sundays',
                message: 'We operate Monday through Saturday. Your pickup date has been moved to Monday.',
              });
              return;
            }
            setPickupDate(val);
          }}
          helperText={
            expressTier === 'standard'
              ? `📅 48-Hr Standard turnaround: Earliest pickup is ${formatDisplayDate(getMinPickupDate('standard'))}.`
              : `⚡ Express Turnaround: Rush pickup unlocked for ${formatDisplayDate(getMinPickupDate(expressTier))}.`
          }
          required
        />

        {/* Real-time Turnaround & Delivery Timeline Card */}
        {pickupDate && (
          <div style={{
            background: 'rgba(201, 161, 74, 0.08)',
            border: '1px solid rgba(201, 161, 74, 0.3)',
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
                ✨ Match-Ready Guarantee Timeline
              </span>
              <strong style={{ fontSize: '14px', color: 'var(--color-navy)', display: 'block', marginTop: '2px' }}>
                Pickup: {formatDisplayDate(pickupDate)} → Delivery: {getEstimatedDeliveryDate(pickupDate, expressTier)}
              </strong>
            </div>
            <Badge variant="success">🛡️ 48-Hr Match-Ready</Badge>
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

        {/* Express Tier Turnaround Speed Selector */}
        <div className={styles.expressOptionBox}>
          <div className={styles.expressHeader}>
            <label className={styles.fieldLabel} style={{ marginBottom: 0 }}>
              ⚡ Turnaround Speed &amp; Processing:
            </label>
            <Badge variant="info">
              {expressTier === 'standard'
                ? 'Standard: 48 Hours'
                : expressTier === 'express_8hr'
                ? 'Express < 8 Hours (+25%)'
                : 'Express < 4 Hours (+40%)'}
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
              className={`${styles.tierCard} ${expressTier === 'express_8hr' ? styles.selectedTier : ''}`}
              onClick={() => handleSelectTier('express_8hr')}
              aria-pressed={expressTier === 'express_8hr'}
            >
              <span className={styles.tierTitle}>Under 8 Hr Rush</span>
              <span className={styles.tierBadge}>+25% Surcharge</span>
              <span className={styles.tierDesc}>Same-day rush return</span>
            </button>
            <button
              type="button"
              className={`${styles.tierCard} ${expressTier === 'express_4hr' ? styles.selectedTier : ''}`}
              onClick={() => handleSelectTier('express_4hr')}
              aria-pressed={expressTier === 'express_4hr'}
            >
              <span className={styles.tierTitle}>Under 4 Hr VIP</span>
              <span className={styles.tierBadge}>+40% Surcharge</span>
              <span className={styles.tierDesc}>Immediate priority plant run</span>
            </button>
          </div>
          <p className={styles.expressNote} style={{ marginTop: 'var(--space-2)' }}>
            All orders include contactless porch pickup/delivery with photo-verified chain of custody.
          </p>
        </div>
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
