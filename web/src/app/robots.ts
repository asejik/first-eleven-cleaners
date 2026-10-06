import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/constants';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();


  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Only the API is blocked. Private pages carry noindex (meta tag and
      // X-Robots-Tag header), which crawlers can read only if allowed in (P08 SEO-05).
      disallow: ['/api/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
