import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Skip a Routine Pickup',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RoutineSkipLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
