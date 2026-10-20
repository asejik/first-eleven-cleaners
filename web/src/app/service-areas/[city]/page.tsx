import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMetadata, SITE_URL } from '@/lib/seo';
import { CalendarDays, MapPin, Truck, Wallet } from 'lucide-react';
import { Card, ButtonLink, Icon } from '@/components/ui';
import { ROUTES, EXPRESS_BADGE, PICKUP_WINDOWS, WASH_FOLD_PRICE_PER_LB } from '@/lib/constants';
import { resolveCoverage } from '@/lib/coverage';
import { getCoverage } from '@/lib/coverage-settings';
import { SATURDAY_PICKUP_NOTICE } from '@/lib/schedule';
import { CITY_PAGES, cityDescription, cityPage, cityPagePath, cityTurnaround, placesText, type CityPage as City } from '@/lib/city-pages';
import type { Coverage } from '@/lib/coverage';
import { ENV_FEE_LABEL, SALES_TAX_LABEL, EXPRESS_COMING_SOON_BADGE, shirtPricesLine } from '@/lib/published-prices';
import styles from '../page.module.css';

// Minimums and route days come from the live coverage settings, like /service-areas
export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return CITY_PAGES.map((c) => ({ city: c.slug }));
}

/** The page's ZIPs still on a Metroplex zone list, each with its zone (tier-down minimums included) */
function servedZips(city: City, coverage: Coverage) {
  return city.zips
    .map((zip) => ({ zip, result: resolveCoverage({ zip }, coverage) }))
    .flatMap(({ zip, result }) => (result.status === 'served' && result.zone.id !== 'zone_5' ? [{ zip, zone: result.zone }] : []));
}

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }) {
  const city = cityPage((await params).city);
  if (!city) return {};
  const served = servedZips(city, await getCoverage());
  return pageMetadata({
    path: cityPagePath(city.slug),
    title: city.title,
    description: cityDescription(city, served[0]?.zone.routeDays ?? []),
    imageAlt: `First Eleven Cleaners - pickup and delivery in ${city.name}`,
  });
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const city = cityPage((await params).city);
  if (!city) notFound();

  const served = servedZips(city, await getCoverage());
  if (served.length === 0) notFound();

  const minimums = served.map((s) => s.zone.minimumOrder);
  const lowest = Math.min(...minimums);
  const minimumLabel = minimums.every((m) => m === lowest) ? `$${lowest.toFixed(0)} order minimum` : `Order minimums from $${lowest.toFixed(0)}`;
  const zone = served[0].zone;
  const express = served.every((s) => s.zone.expressEligible);
  const turnaround = cityTurnaround(zone.routeDays);
  const saturday = zone.routeDays.includes('Saturday');
  const where = placesText(city.places);
  const others = CITY_PAGES.filter((c) => c.slug !== city.slug);
  const [morning, evening] = PICKUP_WINDOWS;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Service Areas', item: `${SITE_URL}/service-areas` },
          { '@type': 'ListItem', position: 2, name: city.name, item: `${SITE_URL}${cityPagePath(city.slug)}` },
        ],
      },
      {
        '@type': 'Service',
        name: `Dry cleaning and laundry pickup and delivery in ${where}`,
        serviceType: 'Dry cleaning and laundry pickup and delivery',
        provider: { '@id': `${SITE_URL}/#organization` },
        areaServed: city.places.map((name) => ({ '@type': 'City', name })),
        url: `${SITE_URL}${cityPagePath(city.slug)}`,
      },
    ],
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className={styles.heroSection}>
        <div className={styles.container}>
          <span className={styles.badge}>{zone.badge} · Free Pickup &amp; Delivery</span>
          <h1 className={styles.pageTitle}>Dry Cleaning &amp; Laundry Pickup in {city.name}</h1>
          <p className={styles.pageSubtitle}>
            We pick up and deliver dry cleaning, laundered shirts and wash &amp; fold across {where}. Pickup and delivery
            are free, and {turnaround}.
          </p>
          <div className={styles.heroActions}>
            <ButtonLink href={ROUTES.book} variant="primary" size="lg">
              Schedule a Pickup
            </ButtonLink>
            <ButtonLink href={ROUTES.pricing} variant="outlineLight" size="lg">
              See the Full Price List
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.regionsGrid}>
            <Card variant="bordered" padding="lg" className={styles.regionCard}>
              <div className={styles.regionHeader}>
                <h2 className={styles.regionTitle}>What it costs</h2>
              </div>
              <div className={styles.zoneSpecRow}>
                <span className={`${styles.zonePill} ${styles.zonePillHighlight}`}><Icon icon={Wallet} /> {minimumLabel}</span>
                <span className={`${styles.zonePill} ${styles.zonePillHighlight}`}><Icon icon={Truck} /> $0 Pickup &amp; Delivery</span>
                <span className={`${styles.zonePill} ${express ? styles.zonePillHighlight : styles.zonePillMuted}`}>
                  {express ? EXPRESS_BADGE : `24-Hr Express: ${EXPRESS_COMING_SOON_BADGE}`}
                </span>
              </div>
              <p className={styles.regionDesc}>
                {shirtPricesLine()}. Wash &amp; fold ${WASH_FOLD_PRICE_PER_LB.toFixed(2)}/lb. Every other item is priced on our{' '}
                <Link href={ROUTES.pricing}>published price list</Link>. The {ENV_FEE_LABEL} and {SALES_TAX_LABEL} are
                shown before you pay.
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.regionCard}>
              <div className={styles.regionHeader}>
                <h2 className={styles.regionTitle}>How it works</h2>
              </div>
              <div className={styles.zoneSpecRow}>
                <span className={styles.zonePill}><Icon icon={CalendarDays} /> {zone.routeScheduleLabel}</span>
              </div>
              <p className={styles.regionDesc}>
                Choose a {morning.label.toLowerCase()} ({morning.start} to {morning.end}) or {evening.label.toLowerCase()} (
                {evening.start} to {evening.end}) window. Every garment is photographed and tracked by order number in your
                Garment Passport, and {turnaround}.{saturday && ` ${SATURDAY_PICKUP_NOTICE}`}
              </p>
            </Card>

            <Card variant="bordered" padding="lg" className={styles.regionCard}>
              <div className={styles.regionHeader}>
                <h2 className={styles.regionTitle}>ZIP codes we serve</h2>
              </div>
              <div className={styles.cityList}>
                {served.map(({ zip }) => (
                  <span key={zip} className={styles.cityTag}>
                    <Icon icon={MapPin} /> {zip}
                  </span>
                ))}
              </div>
              <p className={styles.regionDesc}>
                Enter your address when you book to see your pickup days and minimum.
              </p>
            </Card>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Also serving</h2>
          </div>
          <div className={styles.cityList}>
            {others.map((c) => (
              <Link key={c.slug} href={cityPagePath(c.slug)} className={styles.cityTag}>
                <Icon icon={MapPin} /> {c.name}
              </Link>
            ))}
            <Link href={ROUTES.serviceAreas} className={styles.cityTag}>
              All service areas →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
