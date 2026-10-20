import { pageMetadata } from '@/lib/seo';

// The prices quoted here are checked against the rate card by tests/published-prices.test.ts
// (client review 2026-10-20, #3 and #4).
export const metadata = pageMetadata({
  path: '/pricing',
  title: 'Laundry & Dry Cleaning Prices Dallas',
  description:
    'Wash & fold $3.00/lb, minimums from $45 by service area. Dry-cleaned shirts $8.99, laundered shirts $4.99. Free pickup and delivery across DFW.',
  imageAlt: 'First Eleven Cleaners - Laundry & Dry Cleaning Pricing in Dallas–Fort Worth',
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
