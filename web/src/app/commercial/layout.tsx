import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/commercial',
  title: 'Commercial Laundry & Dry Cleaning',
  description:
    'SLA-backed dry cleaning and laundry programs for DFW hotels, salons, gyms and offices. Certified MBE, SDVOSB, Texas Veteran-HUB and DBE.',
  imageAlt: 'First Eleven Cleaners - Commercial B2B Laundry & Dry Cleaning Programs',
});

export default function CommercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
