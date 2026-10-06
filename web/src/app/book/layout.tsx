import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  path: '/book',
  title: 'Schedule Laundry Pickup & Delivery',
  description:
    'Book dry cleaning and wash & fold pickup across Dallas-Fort Worth. Choose a morning or evening window. 48-hour Match-Ready turnaround.',
  imageAlt: 'First Eleven Cleaners - Schedule Laundry Pickup & Delivery',
});

export default function BookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
