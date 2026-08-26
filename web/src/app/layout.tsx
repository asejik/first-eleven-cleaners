import type { Metadata, Viewport } from 'next';
import { Inter, Archivo } from 'next/font/google';
import { QueryProvider } from '@/providers/query-provider';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ToastContainer } from '@/components/ui/Toast';
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
  title: {
    default: 'First Eleven Cleaners | Premium Dry Cleaning & Laundry Delivery — Dallas, TX',
    template: '%s | First Eleven Cleaners',
  },
  description:
    'Born on the world\'s biggest stage. Premium AI-augmented dry cleaning and laundry pickup & delivery across the Dallas-Fort Worth Metroplex. 48-hour Match-Ready guarantee.',
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
    title: 'First Eleven Cleaners | Premium Dry Cleaning & Laundry Delivery',
    description:
      'Born on the world\'s biggest stage. Now serving yours. Premium pickup & delivery dry cleaning across DFW.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1F3A',
};

import { AuthProvider } from '@/hooks/useAuth';
import { ConciergeWidget } from '@/components/concierge/ConciergeWidget';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${archivo.variable}`}>
      <body>
        <QueryProvider>
          <AuthProvider>
            <Header />
            <main>{children}</main>
            <Footer />
            <ToastContainer />
            <ConciergeWidget />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
