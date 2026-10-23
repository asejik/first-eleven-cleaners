'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { ButtonLink } from '@/components/ui';
import { ROUTES } from '@/lib/constants';

/**
 * VAN-01 (client 2026-10-23): the visit is recorded once the page is open in a browser (link
 * previews and prefetches don't run it), and the first visit sets the cookie the booking reads.
 * "Schedule Your Pickup" is recorded on the way out with sendBeacon, so it never slows the tap.
 */
const via = () => new URLSearchParams(window.location.search).get('via');

function send(event: 'visit' | 'book_click', keepalive = false) {
  const body = JSON.stringify({ event, via: via() });
  if (keepalive && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/marketing/visit', new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch('/api/marketing/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive }).catch(() => {});
}

export function VanVisit() {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    send('visit');
  }, []);
  return null;
}

export function VanBookButton({ children }: { children: ReactNode }) {
  return (
    <ButtonLink href={ROUTES.book} variant="primary" size="lg" fullWidth onClick={() => send('book_click', true)}>
      {children}
    </ButtonLink>
  );
}
