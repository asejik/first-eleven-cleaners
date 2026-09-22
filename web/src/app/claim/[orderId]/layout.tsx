import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'File Care Claim',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
