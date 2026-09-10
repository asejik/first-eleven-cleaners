import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Schedule Laundry Pickup & Delivery | First Eleven Cleaners',
  description:
    'Schedule premium dry cleaning and wash-and-fold laundry pickup across Dallas–Fort Worth. Choose morning or evening windows. 48-hour Match-Ready turnaround.',
  openGraph: {
    title: 'Schedule Laundry Pickup & Delivery | First Eleven Cleaners',
    description:
      'Schedule premium dry cleaning and wash-and-fold laundry pickup across Dallas–Fort Worth. Choose morning or evening windows. 48-hour Match-Ready turnaround.',
  },
};

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
