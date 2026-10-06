import { ButtonLink } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './CancelledOrderPanel.module.css';

function formatPickupDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Shown instead of the progress timeline and delivery estimate for a cancelled order
 * (P05 AR-04). Orders can only be cancelled before pickup, before any charge (PR-02).
 */
export function CancelledOrderPanel({ pickupDate }: { pickupDate?: string | null }) {
  const date = formatPickupDate(pickupDate);
  return (
    <div className={styles.panel} role="status">
      <span className={styles.icon} aria-hidden="true">
        ❌
      </span>
      <div className={styles.body}>
        <strong className={styles.title}>This pickup was cancelled</strong>
        <p className={styles.text}>
          {date ? `The pickup scheduled for ${date} won't take place. ` : ''}
          Your card was not charged.
        </p>
      </div>
      <ButtonLink href={ROUTES.book} variant="primary" size="sm" className={styles.action}>
        Book a New Pickup
      </ButtonLink>
    </div>
  );
}
