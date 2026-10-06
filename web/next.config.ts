import type { NextConfig } from "next";

// 'unsafe-eval' is only needed by the dev server (React Refresh); production omits it (SEC-23)
const scriptEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'";

// Private sections: keep out of search even if a page's own noindex meta is lost (P08 SEO-05)
const NOINDEX_SECTIONS = [
  'dashboard',
  'mission-control',
  'staff',
  'claim',
  'portal',
  'track',
  'login',
  'signup',
  'forgot-password',
  'reset-password',
];

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
  async headers() {
    return [
      {
        // first-eleven-cleaners.vercel.app serves the production site too; only www should be indexed (P08 SEO-06)
        source: '/:path*',
        has: [{ type: 'host', value: '.*\\.vercel\\.app' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
      ...NOINDEX_SECTIONS.map((section) => ({
        source: `/${section}/:path*`,
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      })),
      {
        source: '/:file*(og-image.jpg|og-image.png|icon.png|logo.png|favicon.ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=86400',
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self'${scriptEval} 'unsafe-inline' https://*.supabase.co https://web.squarecdn.com https://sandbox.web.squarecdn.com https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://*.squarecdn.com; img-src 'self' blob: data: https://images.unsplash.com https://*.supabase.co https://*.squarecdn.com; font-src 'self' https://fonts.gstatic.com https://web.squarecdn.com https://*.squarecdn.com https://d1g145x70srn7h.cloudfront.net data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.squareup.com https://*.squareupsandbox.com https://*.squarecdn.com https://*.sentry.io https://*.datadoghq.com https://vitals.vercel-insights.com; frame-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://*.squareup.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';`,

          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/admin',
        destination: '/mission-control',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
