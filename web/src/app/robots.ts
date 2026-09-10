import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/constants';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getAppBaseUrl();


  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard/',
        '/mission-control/',
        '/staff/',
        '/admin/',
        '/claim/',
        '/portal/',
        '/driver/',
        '/api/',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
