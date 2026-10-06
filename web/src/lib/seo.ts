import type { Metadata } from 'next';
import {
  APP_NAME,
  DRY_CLEAN_PRICES,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  WASH_FOLD_PRICE_PER_LB,
} from '@/lib/constants';

/**
 * Canonical public address of the site (P08 SEO-01).
 * Vercel serves www and 308-redirects the bare domain to it, so canonicals,
 * Open Graph URLs and structured data must all name www. This is fixed, not
 * read from env, so preview and local builds never emit their own host as canonical.
 */
export const SITE_URL = 'https://www.firstelevencleaners.com';

const OG_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630 };

/**
 * Metadata for a public page (P08 SEO-04): canonical plus a complete Open Graph
 * and Twitter preview, so no page inherits the homepage's share title. Paths are
 * resolved against metadataBase (SITE_URL). The homepage passes its full title.
 */
export function pageMetadata({
  path,
  title,
  description,
  imageAlt,
}: {
  path: string;
  title: string;
  description: string;
  imageAlt: string;
}): Metadata {
  const isHome = path === '/';
  const shareTitle = isHome ? title : `${title} | ${APP_NAME}`;
  return {
    title: isHome ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'en_US',
      siteName: APP_NAME,
      url: path,
      title: shareTitle,
      description,
      images: [{ ...OG_IMAGE, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
      images: [OG_IMAGE.url],
    },
  };
}

/**
 * Published "dry cleaning from" price (P08 SEO-13): the cheapest dry-cleaned
 * item. The laundered shirt is washed and pressed, not dry cleaned, so it's excluded.
 */
export function dryCleanFromPrice(): number {
  return Math.min(
    ...Object.entries(DRY_CLEAN_PRICES)
      .filter(([key]) => key !== 'laundered_shirt')
      .map(([, item]) => item.price),
  );
}

const phoneForSchema = (display: string) => {
  const d = display.replace(/\D/g, '');
  return `+1-${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
};

/**
 * Site-wide JSON-LD (P08 SEO-03). Only confirmed, visible facts: the business is
 * pickup and delivery only, so no street address or coordinates, and its hours
 * aren't confirmed, so none are published. Prices come from the catalog.
 */
export function buildSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: APP_NAME,
        description:
          'Every Garment Makes the Lineup. Premium AI-augmented dry cleaning and laundry pickup & delivery across the Dallas-Fort Worth Metroplex.',
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
      },
      {
        '@type': 'DryCleaningOrLaundryService',
        '@id': `${SITE_URL}/#organization`,
        name: APP_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/logo.png`,
        image: [`${SITE_URL}/og-image.jpg`, `${SITE_URL}/logo.png`],
        telephone: phoneForSchema(SUPPORT_PHONE),
        email: SUPPORT_EMAIL,
        priceRange: '$$',
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Dallas',
          addressRegion: 'TX',
          addressCountry: 'US',
        },
        areaServed: [
          { '@type': 'AdministrativeArea', name: 'Dallas-Fort Worth Metroplex' },
          { '@type': 'City', name: 'Dallas' },
          { '@type': 'City', name: 'Highland Park' },
          { '@type': 'City', name: 'University Park' },
          { '@type': 'City', name: 'Frisco' },
          { '@type': 'City', name: 'Plano' },
          { '@type': 'City', name: 'Fort Worth' },
        ],
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Garment Care Services',
          itemListElement: [
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Wash & Fold Laundry Pickup & Delivery',
                description:
                  'Weighed on digital calibrated scales, sorted by fabric color, washed, dried, hand-folded, and packaged with digital passport documentation.',
              },
              price: WASH_FOLD_PRICE_PER_LB.toFixed(2),
              priceCurrency: 'USD',
              unitText: 'lb',
            },
            {
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: 'Match-Ready Dry Cleaning',
                description:
                  'Individual stain pre-treatment, gentle eco-solvent cleaning, hand-finishing, and custom hanger packaging.',
              },
              priceSpecification: {
                '@type': 'PriceSpecification',
                minPrice: dryCleanFromPrice().toFixed(2),
                priceCurrency: 'USD',
              },
            },
          ],
        },
      },
    ],
  };
}
