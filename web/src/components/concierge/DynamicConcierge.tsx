'use client';

import dynamic from 'next/dynamic';

const ConciergeWidget = dynamic(
  () => import('./ConciergeWidget').then((mod) => mod.ConciergeWidget),
  { ssr: false }
);

export function DynamicConcierge() {
  return <ConciergeWidget />;
}
