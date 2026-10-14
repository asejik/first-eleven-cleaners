import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Book Next Week',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RebookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
