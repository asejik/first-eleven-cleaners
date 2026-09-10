import Link from 'next/link';
import Image from 'next/image';
import { ROUTES, APP_NAME, SUPPORT_PHONE, SUPPORT_EMAIL } from '@/lib/constants';
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
              Every Garment Makes the Lineup.
            </p>
            <p className={styles.location}>📍 Dallas-Fort Worth Metroplex</p>
          </div>

          {/* Services */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Services</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.pricing}>Dry Cleaning</Link>
              <Link href={ROUTES.pricing}>Wash &amp; Fold</Link>
              <Link href={ROUTES.serviceAreas}>DFW Service Areas</Link>
              <Link href={ROUTES.pricing}>Published Pricing</Link>
            </nav>
          </div>

          {/* Company */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Company</h4>
            <nav className={styles.columnLinks}>
              <Link href={ROUTES.about}>About Us</Link>
              <Link href={ROUTES.about}>FIFA World Cup Story</Link>
              <Link href={ROUTES.commercial}>For Business &amp; B2B</Link>
              <Link href={ROUTES.dashboard}>Customer Portal</Link>
            </nav>
          </div>

          {/* Support */}
          <div className={styles.column}>
            <h4 className={styles.columnTitle}>Support</h4>
            <nav className={styles.columnLinks}>
              <a
                href={`tel:${SUPPORT_PHONE.replace(/\D/g, '')}`}
                className={styles.contactLink}
                style={{ color: 'var(--color-gold)', fontWeight: 600 }}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.contactIcon}
                  aria-hidden="true"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <span>{SUPPORT_PHONE}</span>
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className={styles.contactLinkEmail}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.contactIcon}
                  aria-hidden="true"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                <span>{SUPPORT_EMAIL}</span>
              </a>
              <Link href={ROUTES.pricing}>100% Make It Right Guarantee</Link>
              <Link href={ROUTES.book}>Schedule Pickup</Link>
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
