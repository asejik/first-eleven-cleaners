import type { Metadata, Viewport } from 'next';
import { Inter, Archivo } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CustomerOnly } from '@/components/layout/CustomerOnly';
import { MobileNav } from '@/components/layout/MobileNav';
import { ToastContainer } from '@/components/ui/Toast';
import { CookieConsent } from '@/components/ui/CookieConsent';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { SITE_URL, buildSiteJsonLd } from '@/lib/seo';
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
  metadataBase: new URL(SITE_URL),
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
        url: '/og-image.jpg',
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
    images: ['/og-image.jpg'],
  },
  icons: {
    icon: [
      { url: '/icon.webp', type: 'image/webp' },
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icon.webp',
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
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION && {
      other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION },
    }),
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildSiteJsonLd()) }}
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
            <CustomerOnly>
              <Footer />
            </CustomerOnly>
            <MobileNav />
            <ToastContainer />
            <CustomerOnly>
              <DynamicConcierge />
            </CustomerOnly>
            <CookieConsent />
            <ServiceWorkerRegister />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
