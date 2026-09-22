import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: {
    canonical: '/book',
  },
  title: 'Schedule Laundry Pickup & Delivery',
  description:
    'Schedule premium dry cleaning and wash-and-fold laundry pickup across Dallas–Fort Worth. Choose morning or evening windows. 48-hour Match-Ready turnaround.',
  openGraph: {
    title: 'Schedule Laundry Pickup & Delivery | First Eleven Cleaners',
    description:
      'Schedule premium dry cleaning and wash-and-fold laundry pickup across Dallas–Fort Worth. Choose morning or evening windows. 48-hour Match-Ready turnaround.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'First Eleven Cleaners - Schedule Laundry Pickup & Delivery',
      },
    ],
  },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
