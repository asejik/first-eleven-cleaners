import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/pricing',
  title: 'Laundry & Dry Cleaning Prices Dallas',
  description:
    'Published prices: $3.00/lb wash & fold ($45 minimum), dry cleaning from $8.99. Free pickup and delivery across DFW. Every fee shown before you book.',
  imageAlt: 'First Eleven Cleaners - Laundry & Dry Cleaning Pricing in Dallas–Fort Worth',
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
