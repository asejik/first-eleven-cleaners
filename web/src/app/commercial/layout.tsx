import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/commercial',
  title: 'Commercial B2B Laundry & Dry Cleaning',
  description:
    'SLA-backed B2B dry cleaning and commercial laundry programs for Dallas–Fort Worth businesses, hotels, salons, and athletic facilities. Certified MBE, SDVOSB, Veteran-HUB, DBE.',
  imageAlt: 'First Eleven Cleaners - Commercial B2B Laundry & Dry Cleaning Programs',
});

export default function CommercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
