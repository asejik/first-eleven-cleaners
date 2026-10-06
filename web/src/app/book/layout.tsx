import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/book',
  title: 'Schedule Laundry Pickup & Delivery',
  description:
    'Schedule premium dry cleaning and wash-and-fold laundry pickup across Dallas–Fort Worth. Choose morning or evening windows. 48-hour Match-Ready turnaround.',
  imageAlt: 'First Eleven Cleaners - Schedule Laundry Pickup & Delivery',
});

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
