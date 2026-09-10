import Link from 'next/link';
import {
  ROUTES,
  APP_TAGLINE,
  PROMO_CODE_LAUNCH,
  PROMO_DISCOUNT_PERCENT,
  EXPRESS_ENABLED,
} from '@/lib/constants';
import { Button } from '@/components/ui';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className={styles.page}>
      {/* === Promo Banner === */}
      <div className={styles.promoBanner}>
        <p>
          🎉 <strong>{PROMO_DISCOUNT_PERCENT}% OFF</strong> your first order — use code{' '}
          <strong>{PROMO_CODE_LAUNCH}</strong> at checkout!
        </p>
      </div>

      {/* === Hero Section === */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            ⚽ Proudly served the 2026 FIFA World Cup International Broadcast Centre — Dallas
          </div>
          <h1 className={styles.heroTitle}>
            Fresh. Pressed.{' '}
            <span className={styles.heroAccent}>Game-Ready.</span>
          </h1>
          <p className={styles.heroSubtitle}>{APP_TAGLINE}</p>
          <p className={styles.heroDescription}>
            Premium dry cleaning and laundry pickup & delivery across the
            Dallas-Fort Worth Metroplex. Transparent pricing. 48-hour turnaround.
            Every step tracked.
          </p>
          <div className={styles.heroActions}>
            <Link href={ROUTES.book}>
              <Button variant="primary" size="lg">
                Schedule a Pickup
              </Button>
            </Link>
            <Link href={ROUTES.pricing}>
              <Button variant="outlineLight" size="lg">
                See Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* === How It Works === */}
      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>
            Your Starting Lineup for{' '}
            <span className={styles.accent}>Laundry Day</span>
          </h2>
          <p className={styles.sectionSubtitle}>
            Three easy steps. That&apos;s it.
          </p>

          <div className={styles.stepsGrid}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepIcon}>📅</div>
              <h3 className={styles.stepTitle}>Schedule Your Pickup</h3>
              <p className={styles.stepDescription}>
                Book online in under 60 seconds. Choose morning or evening,
                any day Monday through Saturday. We come to you.
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepIcon}>✨</div>
              <h3 className={styles.stepTitle}>We Clean With Care</h3>
              <p className={styles.stepDescription}>
                Every garment photographed, tagged, and tracked. Dry cleaning,
                wash & fold, pressing, stain treatment — handled by professionals.
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepIcon}>🚚</div>
              <h3 className={styles.stepTitle}>Delivered to Your Door</h3>
              <p className={styles.stepDescription}>
                Clean, folded, pressed & game-ready within 48 hours. Delivered
                with photo confirmation. Track every step in real-time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* === Services === */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Our Services</h2>
          <div className={styles.servicesGrid}>
            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}>👔</span>
              <h3>Dry Cleaning</h3>
              <p>
                Suits, dresses, formalwear, specialty fabrics, and stain
                remediation at published per-garment rates.
              </p>
              <span className={styles.servicePrice}>From $8.97/garment (shirts from $4.47)</span>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}>🧺</span>
              <h3>Wash &amp; Fold</h3>
              <p>
                Everyday laundry, washed, dried, and neatly folded. $45 minimum order — includes up to 15 lbs ($3.00/lb).
              </p>
              <span className={styles.servicePrice}>$3.00/lb ($45 min)</span>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}>🚐</span>
              <h3>Pickup &amp; Delivery</h3>
              <p>
                Door-to-door across the entire DFW Metroplex. Morning and
                evening windows. Contactless by default.
              </p>
              <span className={styles.servicePrice}>Included</span>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}>⚡</span>
              <h3>Same-Day Express</h3>
              <p>
                {EXPRESS_ENABLED
                  ? 'Need it fast? Express service available with +25% (under 8 hours) and +40% (under 4 hours) tiers.'
                  : 'Available soon — plant capacity confirming. Built for mission-critical fast turnaround.'}
              </p>
              <span className={styles.servicePrice}>{EXPRESS_ENABLED ? 'From +25%' : 'Available Soon'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* === Trust / FIFA Heritage === */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.trustSection}>
            <div className={styles.trustContent}>
              <h2 className={styles.sectionTitle}>
                Trusted by International Media Crews
              </h2>
              <p className={styles.trustText}>
                We served 3,500 accredited international media professionals at
                the FIFA World Cup 2026™ International Broadcast Centre in
                Dallas. Twelve weeks of daily garment-care operations under
                live-event pressure — completed with a signed Vendor Performance
                Confirmation.
              </p>
              <p className={styles.trustText}>
                That same standard of excellence is now available at your
                doorstep. Every garment photographed. Every price published.
                Every step tracked. No surprises — ever.
              </p>
              <div className={styles.trustBadges}>
                <span className={styles.trustBadge}>✅ World Cup Proven</span>
                <span className={styles.trustBadge}>📸 Photo-Documented Intake</span>
                <span className={styles.trustBadge}>💰 Transparent Pricing</span>
                <span className={styles.trustBadge}>📱 Real-Time Tracking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === CTA Section === */}
      <section className={styles.ctaSection}>
        <div className={styles.container}>
          <h2 className={styles.ctaTitle}>
            Ready to make laundry day a win?
          </h2>
          <p className={styles.ctaSubtitle}>
            Clean clothes. More time. Less stress.
          </p>
          <div className={styles.ctaActions}>
            <Link href={ROUTES.book}>
              <Button variant="primary" size="lg">
                Schedule Your First Pickup
              </Button>
            </Link>
          </div>
          <p className={styles.ctaPromo}>
            Use code <strong>{PROMO_CODE_LAUNCH}</strong> for{' '}
            {PROMO_DISCOUNT_PERCENT}% off your first order
          </p>
        </div>
      </section>
    </div>
  );
}
