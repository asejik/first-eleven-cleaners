import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/useAuth';
import { Card, Badge, Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from '@/app/book/page.module.css';

interface StepConfirmationProps {
  confirmedOrder: { order_number: string; id: string };
  pickupDate: string;
  pickupWindow: 'morning' | 'evening';
}

const STAGES = [
  { label: 'Booked', icon: '📋', active: true },
  { label: 'Picked Up', icon: '🚐', active: false },
  { label: 'Weighed & Photo', icon: '⚖️', active: false },
  { label: 'In Cleaning', icon: '✨', active: false },
  { label: 'Out for Delivery', icon: '🚚', active: false },
  { label: 'Delivered', icon: '✅', active: false },
];

export function StepConfirmation({
  confirmedOrder,
  pickupDate,
  pickupWindow,
}: StepConfirmationProps) {
  const { user } = useAuth();

  return (
    <Card variant="bordered" padding="lg" className={styles.confirmationCard}>
      <div className={styles.confHeader}>
        <Image
          src="/icon.png"
          alt="First Eleven"
          width={52}
          height={52}
          style={{ width: '52px', height: '52px', borderRadius: '12px', margin: '0 auto', display: 'block' }}
        />
        <Badge variant="success" size="md">
          Pickup Scheduled
        </Badge>
        <h1 className={styles.confTitle}>You&apos;re in the Starting Lineup!</h1>
        <p className={styles.confSubtitle}>
          Order #{confirmedOrder.order_number} is confirmed. Our van will arrive on{' '}
          <strong>{pickupDate}</strong> ({pickupWindow === 'morning' ? '7:30 - 10:00 AM' : '5:00 - 8:00 PM'}).
        </p>
      </div>

      {/* Domino's Style 6-Stage Progress Indicator */}
      <div className={styles.trackerContainer}>
        <h3>48-Hour Match-Ready Tracker</h3>
        <div className={styles.stageTimeline}>
          {STAGES.map((stg) => (
            <div
              key={stg.label}
              className={`${styles.stageStep} ${stg.active ? styles.stageActive : ''}`}
            >
              <div className={styles.stageDot}>{stg.icon}</div>
              <span className={styles.stageName}>{stg.label}</span>
            </div>
          ))}
        </div>
        <p className={styles.trackerNote}>
          📱 We will send SMS and WhatsApp updates with driver ETA and photo receipts at each milestone.
        </p>
      </div>

      <div className={styles.confActions} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Direct Public Tracking Link (No login required) */}
        <Link href={ROUTES.track(confirmedOrder.id)}>
          <Button variant="primary" size="lg" fullWidth>
            Track Order Live 🔍
          </Button>
        </Link>

        {user ? (
          <Link href={ROUTES.dashboard}>
            <Button variant="outline" fullWidth>
              View in Customer Dashboard
            </Button>
          </Link>
        ) : (
          <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', textAlign: 'center' }}>
              Want 1-click rebooking, saved addresses, and photo receipts in one place?
            </p>
            <Link href={ROUTES.signup}>
              <Button variant="outline" fullWidth>
                Create Account to Save Details
              </Button>
            </Link>
          </div>
        )}

        <Link href={ROUTES.home}>
          <Button variant="ghost" fullWidth>
            Return to Home
          </Button>
        </Link>
      </div>
    </Card>
  );
}
