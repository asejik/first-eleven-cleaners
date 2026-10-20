import {
  ROUTES,
  APP_TAGLINE,
  ORDER_TWO_DISCOUNT,
  ORDER_TWO_WINDOW_DAYS,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from '@/lib/constants';
import { SUPPORT_EMAIL_HREF, SUPPORT_PHONE_HREF } from '@/lib/contact';
import { getCoverage } from '@/lib/coverage-settings';
import { FIFA_STATEMENT } from '@/lib/legal';
import { EXPRESS_COMING_SOON, EXPRESS_COMING_SOON_BADGE, lowestMinimum, shirtPricesLine, washFoldLine } from '@/lib/published-prices';
import Link from 'next/link';
import { ButtonLink, Icon } from '@/components/ui';
import { BadgeCheck, CalendarCheck, Camera, Gift, Receipt, Shirt, Smartphone, Sparkles, Trophy, Truck, WashingMachine, Zap } from 'lucide-react';
import { RoutineSection } from '@/components/marketing/RoutineSection';
import { GoogleReviewsSection } from '@/components/marketing/GoogleReviewsSection';
import { getGoogleReviews } from '@/lib/google-reviews';
import styles from './page.module.css';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/',
  title: 'First Eleven Cleaners | DFW Dry Cleaning & Laundry Pickup',
  description:
    'Premium dry cleaning and wash & fold with free pickup and delivery across Dallas-Fort Worth. 2-business-day Match-Ready turnaround. Book online in minutes.',
  imageAlt: 'First Eleven Cleaners - Every Garment Makes the Lineup',
});

// The Express card follows Mission Control's Express switch (client 2026-10-07, 8E)
export const revalidate = 300;

export default async function HomePage() {
  const [{ expressEnabled, zonesList }, reviews] = await Promise.all([getCoverage(), getGoogleReviews()]);
  const minimumFrom = lowestMinimum(zonesList);
  return (
    <div className={styles.page}>
      {/* === Promo Banner === */}
      <div className={styles.promoBanner}>
        {/* "First order: no promo"; the discount is order two's (client 2026-10-14) */}
        <p>
          <Icon icon={Gift} /> Your second pickup within {ORDER_TWO_WINDOW_DAYS} days is <strong>${ORDER_TWO_DISCOUNT} off</strong>, automatically. No code needed.
        </p>
      </div>

      {/* === Hero Section === */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <Icon icon={Trophy} /> Proudly served the 2026 FIFA World Cup International Broadcast Centre — Dallas
          </div>
          <h1 className={styles.heroTitle}>
            Fresh. Pressed.{' '}
            <span className={styles.heroAccent}>Game-Ready.</span>
          </h1>
          <p className={styles.heroSubtitle}>{APP_TAGLINE}</p>
          <p className={styles.heroDescription}>
            Premium dry cleaning and laundry pickup & delivery across the
            Dallas-Fort Worth Metroplex. Transparent pricing. 2-business-day turnaround.
            Every step tracked.
          </p>
          <div className={styles.heroActions}>
            <ButtonLink href={ROUTES.book} variant="primary" size="lg">
              Schedule a Pickup
            </ButtonLink>
            <ButtonLink href={ROUTES.pricing} variant="outlineLight" size="lg">
              See Pricing
            </ButtonLink>
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
              <div className={styles.stepIcon}><Icon icon={CalendarCheck} size={40} strokeWidth={1.5} /></div>
              <h3 className={styles.stepTitle}>Schedule Your Pickup</h3>
              <p className={styles.stepDescription}>
                Book online in under 60 seconds. Choose morning or evening,
                any day Monday through Saturday. We come to you.
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepIcon}><Icon icon={Sparkles} size={40} strokeWidth={1.5} /></div>
              <h3 className={styles.stepTitle}>We Clean With Care</h3>
              <p className={styles.stepDescription}>
                Every garment photographed and tracked by order number in your Garment Passport. Dry cleaning,
                wash & fold, pressing, stain treatment — handled by professionals.
              </p>
            </div>

            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepIcon}><Icon icon={Truck} size={40} strokeWidth={1.5} /></div>
              <h3 className={styles.stepTitle}>Delivered to Your Door</h3>
              <p className={styles.stepDescription}>
                Clean, folded, pressed & game-ready in 2 business days. Delivered
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
              <span className={styles.serviceIcon}><Icon icon={Shirt} size={32} strokeWidth={1.5} /></span>
              <h3>Dry Cleaning</h3>
              <p>
                Suits, dresses, formalwear, specialty fabrics, and stain
                remediation at published per-garment rates.
              </p>
              <span className={styles.servicePrice}>{shirtPricesLine()}</span>
              <Link href={ROUTES.pricing} className={styles.serviceLink}>
                See the full price list →
              </Link>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}><Icon icon={WashingMachine} size={32} strokeWidth={1.5} /></span>
              <h3>Wash &amp; Fold</h3>
              <p>
                Everyday laundry, washed, dried, and neatly folded. {washFoldLine(minimumFrom)} Your exact minimum shows once you enter your address.
              </p>
              <span className={styles.servicePrice}>From $3.00/lb</span>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}><Icon icon={Truck} size={32} strokeWidth={1.5} /></span>
              <h3>Pickup &amp; Delivery</h3>
              <p>
                Door-to-door across the entire DFW Metroplex. Morning and
                evening windows. Contactless by default.
              </p>
              <span className={styles.servicePrice}>Included</span>
            </div>

            <div className={styles.serviceCard}>
              <span className={styles.serviceIcon}><Icon icon={Zap} size={32} strokeWidth={1.5} /></span>
              <h3>24-Hour Express</h3>
              <p>
                {expressEnabled
                  ? 'Need it fast? 24-Hour Express turnaround, Monday to Thursday pickups, with a +50% surcharge. Picked up morning, delivered next morning.'
                  : EXPRESS_COMING_SOON}
              </p>
              <span className={styles.servicePrice}>{expressEnabled ? 'From +50%' : EXPRESS_COMING_SOON_BADGE}</span>
            </div>
          </div>
        </div>
      </section>

      {/* === First Eleven Routine (client review 2026-10-20, #12) === */}
      <RoutineSection id="routine" />

      {/* === Trust / FIFA Heritage === */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.trustSection}>
            <div className={styles.trustContent}>
              <h2 className={styles.sectionTitle}>
                Trusted by International Media Crews
              </h2>
              <p className={styles.trustText}>{FIFA_STATEMENT}</p>
              <p className={styles.trustText}>
                That same standard of excellence is now available at your
                doorstep. Every garment photographed. Every price published.
                Every step tracked. No surprises — ever.
              </p>
              <div className={styles.trustBadges}>
                <span className={styles.trustBadge}><Icon icon={BadgeCheck} /> FIFA World Cup 2026 IBC</span>
                <span className={styles.trustBadge}><Icon icon={Camera} /> Photo-Documented Intake</span>
                <span className={styles.trustBadge}><Icon icon={Receipt} /> Transparent Pricing</span>
                <span className={styles.trustBadge}><Icon icon={Smartphone} /> Real-Time Tracking</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === Google reviews (client review 2026-10-20, #14) === */}
      <GoogleReviewsSection summary={reviews} />

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
            <ButtonLink href={ROUTES.book} variant="primary" size="lg">
              Schedule Your First Pickup
            </ButtonLink>
          </div>
          <p className={styles.ctaPromo}>
            Your second pickup within {ORDER_TWO_WINDOW_DAYS} days is ${ORDER_TWO_DISCOUNT} off, automatically.
          </p>
          {/* Support contact (client review 2026-10-20, #14) */}
          <p className={styles.ctaContact}>
            Questions? Call <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE}</a> or email{' '}
            <a href={SUPPORT_EMAIL_HREF}>{SUPPORT_EMAIL}</a>.
          </p>
        </div>
      </section>
    </div>
  );
}
