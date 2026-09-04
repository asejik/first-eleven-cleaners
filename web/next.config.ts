import type { NextConfig } from "next";

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
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.supabase.co https://web.squarecdn.com https://sandbox.web.squarecdn.com https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://*.squarecdn.com; img-src 'self' blob: data: https://images.unsplash.com https://*.supabase.co https://*.squarecdn.com; font-src 'self' https://fonts.gstatic.com https://web.squarecdn.com https://*.squarecdn.com data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.squareup.com https://*.squarecdn.com https://*.sentry.io https://*.datadoghq.com https://vitals.vercel-insights.com; frame-src 'self' https://web.squarecdn.com https://sandbox.web.squarecdn.com https://*.squareup.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'; object-src 'none';",

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
