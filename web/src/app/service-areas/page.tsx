import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'DFW Service Areas | Dry Cleaning & Laundry Pickup Dallas–Fort Worth',
  description:
    'Full-coverage dry cleaning and wash-and-fold laundry pickup & delivery across Dallas, Plano, Frisco, Fort Worth, Highland Park, Southlake, and the entire DFW Metroplex.',
  openGraph: {
    title: 'DFW Service Areas | Dry Cleaning & Laundry Pickup Dallas–Fort Worth',
    description:
      'Full-coverage dry cleaning and wash-and-fold laundry pickup & delivery across Dallas, Plano, Frisco, Fort Worth, Highland Park, Southlake, and the entire DFW Metroplex.',
  },
};

interface ServiceRegion {
  name: string;
  badge: string;
  description: string;
  cities: string[];
}

const REGIONS: ServiceRegion[] = [
  {
    name: 'Dallas Central & Core',
    badge: 'Daily Service',
    description: 'High-density daily pickup and delivery for executive residences, high-rises, and boutique businesses.',
    cities: [
      'Downtown Dallas',
      'Uptown & Victory Park',
      'Highland Park',
      'University Park',
      'Preston Hollow',
      'Lakewood & East Dallas',
      'Oak Lawn & Turtle Creek',
      'Design District',
      'Kessler Park & Bishop Arts',
    ],
  },
  {
    name: 'North Dallas Corridor',
    badge: 'Daily Service',
    description: 'Scheduled residential and corporate routes serving major suburban headquarters and residential estates.',
    cities: [
      'Plano (Legacy & West)',
      'Frisco (The Star & Hall Park)',
      'Addison',
      'Carrollton',
      'Richardson (Telecom Corridor)',
      'Allen',
      'McKinney & Craig Ranch',
      'Prosper',
    ],
  },
  {
    name: 'Tarrant County & West Metro',
    badge: 'Scheduled Routes',
    description: 'Comprehensive pickup coverage across Fort Worth cultural districts, business centers, and executive enclaves.',
    cities: [
      'Downtown Fort Worth',
      'Fort Worth Cultural District',
      'Arlington & Entertainment District',
      'Southlake',
      'Colleyville',
      'Grapevine',
      'Keller',
      'Westlake',
    ],
  },
  {
    name: 'Mid-Cities & Las Colinas',
    badge: 'Daily Service',
    description: 'Immediate coverage for corporate corridors, luxury master-planned communities, and residential towers.',
    cities: [
      'Irving & Las Colinas',
      'Coppell',
      'Farmers Branch',
      'Euless',
      'Bedford',
      'Hurst',
      'Grand Prairie',
    ],
  },
];

export default function ServiceAreasPage() {
  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.heroSection}>
        <div className={styles.container}>
          <span className={styles.badge}>Smart Coverage · No ZIP Fences</span>
          <h1 className={styles.pageTitle}>Serving the Entire Dallas–Fort Worth Metroplex</h1>
          <p className={styles.pageSubtitle}>
            Unlike legacy dry cleaners with strict geographic boundaries, First Eleven Cleaners was built with no ZIP code walls. If you have an address in North Texas, our couriers will pick up and deliver your garments match-ready within 48 hours.
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
            <h2 className={styles.sectionTitle}>Metroplex Coverage Zones</h2>
            <p className={styles.sectionSubtitle}>
              Every accepted booking receives a committed window — morning (7:30–10:00 AM) or evening (5:00–8:00 PM).
            </p>
          </div>

          <div className={styles.regionsGrid}>
            {REGIONS.map((region) => (
              <Card key={region.name} variant="bordered" padding="lg" className={styles.regionCard}>
                <div className={styles.regionHeader}>
                  <h3 className={styles.regionTitle}>{region.name}</h3>
                  <span className={styles.regionBadge}>{region.badge}</span>
                </div>
                <p className={styles.regionDesc}>{region.description}</p>
                <div className={styles.cityList}>
                  {region.cities.map((city) => (
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
