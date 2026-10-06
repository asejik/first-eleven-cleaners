import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/pricing',
  title: 'Laundry & Dry Cleaning Prices Dallas',
  description:
    'Transparent, published pricing for dry cleaning and wash-and-fold laundry pickup in Dallas–Fort Worth. $3.00/lb wash & fold ($45 min), dry cleaning from $8.99. Zero hidden fees.',
  imageAlt: 'First Eleven Cleaners - Laundry & Dry Cleaning Pricing in Dallas–Fort Worth',
});

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
