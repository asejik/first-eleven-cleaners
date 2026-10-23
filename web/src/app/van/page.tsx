import Image from 'next/image';
import type { Metadata } from 'next';
import { CalendarCheck, Camera, Scissors, Shirt, Sparkles, Truck, WashingMachine } from 'lucide-react';
import { APP_TAGLINE, SUPPORT_PHONE } from '@/lib/constants';
import { SUPPORT_PHONE_HREF } from '@/lib/contact';
import { getCoverage } from '@/lib/coverage-settings';
import { lowestMinimum, shirtPricesLine, washFoldLine } from '@/lib/published-prices';
import { pageMetadata } from '@/lib/seo';
import { Icon } from '@/components/ui';
import { VanBookButton, VanVisit } from './VanTracking';
import styles from './page.module.css';

/**
 * The van wrap's page (client 2026-10-23): the QR code (?via=qr), the PICKUP text link
 * (?via=text) and the address on the van all land here, one tap from the booking wizard.
 * Kept out of search results so its visits are the van's (VAN-01).
 */
export const metadata: Metadata = {
  ...pageMetadata({
    path: '/van',
    title: 'Schedule Your Pickup',
    description: 'Dry cleaning and laundry, picked up and delivered across Dallas-Fort Worth. Schedule your first pickup in minutes.',
    imageAlt: 'First Eleven Cleaners - Every Garment Makes the Lineup',
  }),
  robots: { index: false, follow: true },
};

export const revalidate = 300;

export default async function VanPage() {
  const { zonesList } = await getCoverage();
  const services = [
    { icon: Shirt, name: 'Dry Cleaning', text: `Suits, dresses, shirts and more. ${shirtPricesLine()}.` },
    { icon: WashingMachine, name: 'Wash & Fold', text: washFoldLine(lowestMinimum(zonesList)) },
    { icon: Sparkles, name: 'Pressing', text: 'Crisp, pressed and on a hanger, ready to wear.' },
    { icon: Scissors, name: 'Alterations', text: 'Hems, zippers, buttons, repairs and pinned adjustments.' },
    { icon: Truck, name: 'Pickup & Delivery', text: 'Free across the DFW Metroplex. We collect from your door and bring it back.' },
  ];

  return (
    <div className={styles.page}>
      <VanVisit />

      <section className={styles.hero}>
        {/* The logo carries the motto */}
        <Image src="/logo.png" alt={`First Eleven Cleaners. ${APP_TAGLINE}`} width={783} height={243} priority className={styles.logo} />
        <h1 className={styles.title}>Dry cleaning &amp; laundry, picked up and delivered.</h1>
        <p className={styles.lead}>Book in a couple of minutes. We pick up, clean and bring it back in 2 business days.</p>
        <div className={styles.cta}>
          <VanBookButton>Schedule Your Pickup</VanBookButton>
        </div>
        <p className={styles.call}>
          Questions? Call or text <a href={SUPPORT_PHONE_HREF}>{SUPPORT_PHONE}</a>
        </p>
      </section>

      <section className={styles.section} aria-labelledby="van-services">
        <h2 id="van-services" className={styles.heading}>
          What we do
        </h2>
        <ul className={styles.services}>
          {services.map((s) => (
            <li key={s.name} className={styles.service}>
              <span className={styles.serviceIcon}>
                <Icon icon={s.icon} />
              </span>
              <div>
                <h3 className={styles.serviceName}>{s.name}</h3>
                <p className={styles.serviceText}>{s.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="van-how">
        <h2 id="van-how" className={styles.heading}>
          How it works
        </h2>
        <ol className={styles.steps}>
          <li>
            <Icon icon={CalendarCheck} /> <span>Pick a pickup day and window.</span>
          </li>
          <li>
            <Icon icon={Truck} /> <span>Our driver collects your bag from your door in your window.</span>
          </li>
          <li>
            <Icon icon={Camera} /> <span>Every garment is photographed and tracked in your Garment Passport, then delivered back to you.</span>
          </li>
        </ol>
        <div className={styles.ctaBottom}>
          <VanBookButton>Schedule Your Pickup</VanBookButton>
        </div>
      </section>
    </div>
  );
}
