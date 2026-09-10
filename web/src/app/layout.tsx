import type { Metadata, Viewport } from 'next';
import { Inter, Archivo } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileNav } from '@/components/layout/MobileNav';
import { ToastContainer } from '@/components/ui/Toast';
import { CookieConsent } from '@/components/ui/CookieConsent';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import '@/styles/globals.css';
import '@/styles/animations.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-archivo',
  weight: ['400', '500', '600', '700', '900'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://firstelevencleaners.com'),
  title: {
    default: 'First Eleven Cleaners | Dry Cleaning & Laundry Pickup in Dallas–Fort Worth',
    template: '%s | First Eleven Cleaners',
  },
  description:
    'Every Garment Makes the Lineup. Premium AI-augmented dry cleaning and laundry pickup & delivery across the Dallas-Fort Worth Metroplex. 48-hour Match-Ready guarantee.',
  keywords: [
    'dry cleaning Dallas',
    'laundry delivery DFW',
    'pickup and delivery dry cleaning',
    'First Eleven Cleaners',
    'Dallas laundry service',
    'wash and fold Dallas',
    'premium dry cleaning',
  ],
  authors: [{ name: 'First Eleven Cleaners' }],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'First Eleven Cleaners',
    title: 'First Eleven Cleaners | Dry Cleaning & Laundry Pickup in Dallas–Fort Worth',
    description:
      'Every Garment Makes the Lineup. Premium pickup & delivery dry cleaning and wash-and-fold across DFW.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'First Eleven Cleaners - Every Garment Makes the Lineup',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'First Eleven Cleaners | Dry Cleaning & Laundry Pickup in Dallas–Fort Worth',
    description:
      'Every Garment Makes the Lineup. Premium dry cleaning and laundry pickup & delivery across DFW.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icon.png',
    apple: [
      { url: '/icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'First Eleven',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0B1F3A',
  viewportFit: 'cover',
};

import { AuthProvider } from '@/hooks/useAuth';
import { DynamicConcierge } from '@/components/concierge/DynamicConcierge';

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'DryCleaningOrLaundryService',
  name: 'First Eleven Cleaners',
  image: 'https://firstelevencleaners.com/icon.png',
  '@id': 'https://firstelevencleaners.com',
  url: 'https://firstelevencleaners.com',
  telephone: '+1-214-555-0199',
  priceRange: '$$',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Downtown Dallas',
    addressLocality: 'Dallas',
    addressRegion: 'TX',
    postalCode: '75201',
    addressCountry: 'US',
  },
  geo: {
    '@type': 'GeoCoordinates',
    latitude: 32.7767,
    longitude: -96.797,
  },
  areaServed: [
    { '@type': 'City', name: 'Dallas' },
    { '@type': 'City', name: 'Highland Park' },
    { '@type': 'City', name: 'University Park' },
    { '@type': 'City', name: 'Frisco' },
    { '@type': 'City', name: 'Plano' },
    { '@type': 'City', name: 'Fort Worth' },
  ],
  openingHoursSpecification: [
    {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '07:00',
      closes: '20:00',
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <QueryProvider>
          <AuthProvider>
            <Header />
            <main id="main-content">{children}</main>
            <Footer />
            <MobileNav />
            <ToastContainer />
            <DynamicConcierge />
            <CookieConsent />
            <ServiceWorkerRegister />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
