import Link from 'next/link';
import { BadgePercent, CalendarClock, SkipForward, SlidersHorizontal } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import { ROUTINE_SIGNUP_PATH, routineHighlights } from '@/lib/routine';
import styles from './RoutineSection.module.css';

const ICONS = { schedule: CalendarClock, pricing: BadgePercent, skip: SkipForward, control: SlidersHorizontal };

/**
 * "First Eleven Routine" (client review 2026-10-20, #12): the standing pickup, shown on the
 * homepage and the pricing page. Works in server and client pages (no hooks).
 */
export function RoutineSection({ id, showPricingLink = true }: { id?: string; showPricingLink?: boolean }) {
  return (
    <section id={id} className={styles.section} aria-labelledby="routine-heading">
      <div className={styles.container}>
        <span className={styles.eyebrow}>Membership</span>
        <h2 id="routine-heading" className={styles.title}>
          First Eleven <span className={styles.accent}>Routine</span>
        </h2>
        <p className={styles.subtitle}>
          Set it once and laundry day takes care of itself. We pick up on your day, in your window, every week or every
          other week.
        </p>
        <ul className={styles.grid}>
          {routineHighlights().map((h) => {
            const Icon = ICONS[h.key];
            return (
              <li key={h.key} className={styles.item}>
                <Icon size={28} strokeWidth={1.6} className={styles.icon} aria-hidden="true" />
                <h3 className={styles.itemTitle}>{h.title}</h3>
                <p className={styles.itemText}>{h.text}</p>
              </li>
            );
          })}
        </ul>
        <div className={styles.actions}>
          <ButtonLink href={ROUTINE_SIGNUP_PATH} variant="primary" size="lg">
            Start Your Routine
          </ButtonLink>
          {showPricingLink && (
            <Link href={`${ROUTES.pricing}#member-prices`} className={styles.link}>
              See member prices
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
