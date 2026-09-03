import Link from 'next/link';
import Image from 'next/image';
import { ROUTES, APP_NAME } from '@/lib/constants';
import styles from './Footer.module.css';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* Top Section */}
        <div className={styles.top}>
          {/* Brand */}
          <div className={styles.brand}>
            <Link href={ROUTES.home} className={styles.logoLink}>
              <Image
                src="/logo.png"
                alt={APP_NAME}
                width={170}
                height={42}
                style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
                className={styles.footerLogoImg}
              />
            </Link>
            <p className={styles.tagline}>
              Born on the world&apos;s biggest stage.<br />
              Now serving yours.
            </p>
            <p className={styles.location}>📍 Dallas-Fort Worth Metroplex</p>
          </div>

          {/* Services */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Services</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.pricing}>Dry Cleaning</Link>
              <Link href={ROUTES.pricing}>Wash & Fold</Link>
              <Link href={ROUTES.pricing}>Express Service</Link>
              <Link href={ROUTES.pricing}>Pricing</Link>
            </nav>
          </div>

          {/* Company */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Company</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.commercial}>For Business</Link>
              <Link href={ROUTES.portal}>Commercial B2B Portal</Link>
              <Link href={ROUTES.about}>About Us</Link>
              <Link href={ROUTES.about}>FIFA World Cup Story</Link>
            </nav>
          </div>

          {/* Operations / Staff */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Operations</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.missionControl}>Mission Control</Link>
              <Link href={ROUTES.intake}>Central Intake</Link>
              <Link href={ROUTES.staffDriver}>Driver App</Link>
              <Link href={ROUTES.dashboard}>Customer Portal</Link>
            </nav>
          </div>

          {/* Legal */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Legal &amp; Trust</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.terms}>Terms of Service</Link>
              <Link href={ROUTES.privacy}>Privacy Policy</Link>
              <Link href={ROUTES.pricing}>Satisfaction Guarantee</Link>
            </nav>
          </div>
        </div>

        {/* Divider */}
        <div className={styles.divider} />

        {/* Bottom Section */}
        <div className={styles.bottom}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p className={styles.copyright}>
              © {currentYear} {APP_NAME}. Operated by Lydia Painting, LLC. All rights reserved.
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
              <Link href={ROUTES.terms} style={{ color: 'var(--color-gray-400)', textDecoration: 'underline' }}>
                Terms of Service
              </Link>
              <span style={{ color: 'var(--color-gray-600)' }}>•</span>
              <Link href={ROUTES.privacy} style={{ color: 'var(--color-gray-400)', textDecoration: 'underline' }}>
                Privacy Policy
              </Link>
            </div>
          </div>
          <div className={styles.certifications}>
            <span className={styles.cert}>MBE</span>
            <span className={styles.cert}>SDVOSB</span>
            <span className={styles.cert}>Veteran-HUB</span>
            <span className={styles.cert}>DBE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
