import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: {
    canonical: '/commercial',
  },
  title: 'Commercial Laundry & Dry Cleaning Dallas–Fort Worth | First Eleven',
  description:
    'SLA-backed B2B dry cleaning and commercial laundry programs for Dallas–Fort Worth businesses, hotels, salons, and athletic facilities. Certified MBE, SDVOSB, Veteran-HUB, DBE.',
  openGraph: {
    title: 'Commercial Laundry & Dry Cleaning Dallas–Fort Worth | First Eleven',
    description:
      'SLA-backed B2B dry cleaning and commercial laundry programs for Dallas–Fort Worth businesses, hotels, salons, and athletic facilities. Certified MBE, SDVOSB, Veteran-HUB, DBE.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'First Eleven Cleaners - Commercial B2B Laundry & Dry Cleaning Programs',
      },
    ],
  },
};

export default function CommercialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
