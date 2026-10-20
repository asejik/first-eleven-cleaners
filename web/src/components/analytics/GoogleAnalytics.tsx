'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useCookieConsent } from '@/components/ui/CookieConsent';
import { analyticsAllowed, gaMeasurementId } from '@/lib/analytics';
import { isStaffRoute } from '@/lib/staff-routes';

/**
 * Loads Google Analytics 4 once the visitor accepts all cookies (Texas TDPSA notice). Page
 * changes inside the app are counted by GA4's enhanced measurement (browser history events).
 * Staff screens are never tracked: the tag isn't loaded there, and if it was loaded on a
 * customer page first, Google's opt-out flag is set while a staff screen is open.
 */
export function GoogleAnalytics() {
  const consent = useCookieConsent();
  const staff = isStaffRoute(usePathname() || '/');
  const id = gaMeasurementId();

  useEffect(() => {
    if (id) (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = staff;
  }, [id, staff]);

  if (!id || !analyticsAllowed(consent) || staff) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  );
}
