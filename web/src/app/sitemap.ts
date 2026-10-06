import type { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/constants';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getAppBaseUrl();


  // No lastModified: there are no real per-page edit dates, and a deploy-time
  // stamp on every URL teaches search engines to ignore it (P08 SEO-09).
  return [
    {
      url: `${baseUrl}`,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/book`,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/pricing`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/about`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/commercial`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/service-areas`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
