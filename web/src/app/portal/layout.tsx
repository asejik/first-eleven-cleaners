import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { COMMERCIAL_PORTAL_ENABLED } from '@/lib/features';

export const metadata: Metadata = {
  title: 'Commercial Portal',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Sample-data portal is switched off for launch (PR-20)
  if (!COMMERCIAL_PORTAL_ENABLED) notFound();
  return <>{children}</>;
}
