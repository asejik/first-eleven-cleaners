import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Laundry & Dry Cleaning Prices Dallas | First Eleven Cleaners',
  description:
    'Transparent, published pricing for dry cleaning and wash-and-fold laundry pickup in Dallas–Fort Worth. $3.00/lb wash & fold ($45 min), dry cleaning from $8.97. Zero hidden fees.',
  openGraph: {
    title: 'Laundry & Dry Cleaning Prices Dallas | First Eleven Cleaners',
    description:
      'Transparent, published pricing for dry cleaning and wash-and-fold laundry pickup in Dallas–Fort Worth. $3.00/lb wash & fold ($45 min), dry cleaning from $8.97. Zero hidden fees.',
  },
};

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
