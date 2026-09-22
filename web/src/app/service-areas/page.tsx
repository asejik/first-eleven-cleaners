import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { ROUTES, ZONES_LIST } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  alternates: {
    canonical: '/service-areas',
  },
  title: 'DFW Service Areas | Dry Cleaning & Laundry Pickup Dallas–Fort Worth',
  description:
    'Full-coverage dry cleaning and wash-and-fold laundry pickup & delivery across Dallas, Plano, Frisco, Fort Worth, Highland Park, Southlake, and the entire DFW Metroplex.',
  openGraph: {
    title: 'DFW Service Areas | Dry Cleaning & Laundry Pickup Dallas–Fort Worth',
    description:
      'Full-coverage dry cleaning and wash-and-fold laundry pickup & delivery across Dallas, Plano, Frisco, Fort Worth, Highland Park, Southlake, and the entire DFW Metroplex.',
  },
};

export default function ServiceAreasPage() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroSection}>
        <div className={styles.container}>
          <span className={styles.badge}>Smart Coverage · No ZIP Fences</span>
          <h1 className={styles.pageTitle}>Serving the Entire Dallas–Fort Worth Metroplex</h1>
          <p className={styles.pageSubtitle}>
            Unlike legacy dry cleaners with strict geographic boundaries, First Eleven Cleaners was built with no ZIP code walls. Delivery stays 100% free everywhere; order minimums scale fairly by zone to maintain route economics.
          </p>
          <div className={styles.heroActions}>
            <Link href={ROUTES.book}>
              <Button variant="primary" size="lg">
                Schedule a Pickup in Your Area
              </Button>
            </Link>
            <Link href={ROUTES.pricing}>
              <Button variant="outlineLight" size="lg">
                View Published Pricing
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Regions Grid */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Smart Metroplex Coverage Zones</h2>
            <p className={styles.sectionSubtitle}>
              Every accepted booking receives a committed window — morning (7:30–10:00 AM) or evening (5:00–8:00 PM). Door-to-door courier delivery is always complimentary.
            </p>
          </div>

          <div className={styles.regionsGrid}>
            {ZONES_LIST.map((zone) => (
              <Card key={zone.id} variant="bordered" padding="lg" className={styles.regionCard}>
                <div className={styles.regionHeader}>
                  <h3 className={styles.regionTitle}>{zone.name}</h3>
                  <span className={styles.regionBadge}>{zone.badge}</span>
                </div>

                <div className={styles.zoneSpecRow}>
                  <span className={`${styles.zonePill} ${styles.zonePillHighlight}`}>
                    💰 ${zone.minimumOrder.toFixed(0)} min
                  </span>
                  <span className={`${styles.zonePill} ${styles.zonePillHighlight}`}>
                    🚐 $0 Free Delivery
                  </span>
                  <span className={styles.zonePill}>
                    📅 {zone.routeScheduleLabel}
                  </span>
                  <span
                    className={`${styles.zonePill} ${
                      zone.expressEligible ? styles.zonePillHighlight : styles.zonePillMuted
                    }`}
                  >
                    {zone.expressEligible ? '⚡ 24-Hr Express' : '⏱ Standard Turnaround'}
                  </span>
                </div>

                <p className={styles.regionDesc}>{zone.tagline}</p>

                <div className={styles.cityList}>
                  {zone.cities.map((city) => (
                    <span key={city} className={styles.cityTag}>
                      📍 {city}
                    </span>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* No Zip Fence Callout */}
          <div className={styles.coverageCallout}>
            <div className={styles.calloutIcon}>🗺️</div>
            <div>
              <h3 className={styles.calloutTitle}>Don&apos;t see your specific neighborhood listed?</h3>
              <p className={styles.calloutText}>
                We serve all residential and business addresses throughout the greater Dallas-Fort Worth metro area. Enter your address during booking and our dynamic routing engine will automatically assign you to the next available route window.
              </p>
            </div>
            <Link href={ROUTES.book} className={styles.calloutAction}>
              <Button variant="primary">Check Your Address</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Operating Standards */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.standardsGrid}>
            <div className={styles.standardBox}>
              <span className={styles.stdIcon}>⏱️</span>
              <h4>48-Hour Turnaround</h4>
              <p>Picked up today, returned clean, pressed, and game-ready within 48 hours.</p>
            </div>
            <div className={styles.standardBox}>
              <span className={styles.stdIcon}>🚐</span>
              <h4>Morning &amp; Evening Windows</h4>
              <p>Convenient 7:30–10:00 AM and 5:00–8:00 PM slots aligned with when you are actually home.</p>
            </div>
            <div className={styles.standardBox}>
              <span className={styles.stdIcon}>📸</span>
              <h4>Contactless Photo Verification</h4>
              <p>Every pickup and delivery is documented with photo timestamps in your Garment Passport.</p>
            </div>
            <div className={styles.standardBox}>
              <span className={styles.stdIcon}>🛡️</span>
              <h4>100% Make It Right</h4>
              <p>Refund-first culture backed by an instant one-tap claim button on every receipt.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
