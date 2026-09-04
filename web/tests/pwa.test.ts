import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ROUTES } from '@/lib/constants';

describe('PWA Configuration & Mobile App Standards', () => {
  describe('Web App Manifest (public/manifest.json)', () => {
    const manifestPath = path.resolve(import.meta.dirname, '../public/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    it('defines required PWA metadata for installation', () => {
      expect(manifest.name).toBe('First Eleven Cleaners');
      expect(manifest.short_name).toBe('First Eleven');
      expect(manifest.start_url).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.orientation).toBe('portrait');
      expect(manifest.theme_color).toBe('#0B1F3A');
      expect(manifest.background_color).toBe('#0B1F3A');
    });

    it('contains maskable icons for Android and modern OS adaptive styling', () => {
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

      const hasMaskable = manifest.icons.some(
        (icon: { purpose?: string }) => icon.purpose && icon.purpose.includes('maskable')
      );
      expect(hasMaskable).toBe(true);
    });

    it('defines quick action shortcuts for booking and orders', () => {
      expect(Array.isArray(manifest.shortcuts)).toBe(true);
      const urls = manifest.shortcuts.map((s: { url: string }) => s.url);
      expect(urls).toContain('/book');
      expect(urls).toContain('/dashboard');
    });
  });

  describe('Service Worker (public/sw.js)', () => {
    const swPath = path.resolve(import.meta.dirname, '../public/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf-8');

    it('implements core PWA lifecycle events', () => {
      expect(swContent).toContain("addEventListener('install'");
      expect(swContent).toContain("addEventListener('activate'");
      expect(swContent).toContain("addEventListener('fetch'");
    });

    it('bypasses /api/ routes to protect live transactional data', () => {
      expect(swContent).toContain("url.pathname.startsWith('/api/')");
    });

    it('pre-caches essential app shell assets', () => {
      expect(swContent).toContain("'/manifest.json'");
      expect(swContent).toContain("'/icon.png'");
      expect(swContent).toContain("'/logo.png'");
    });
  });

  describe('Mobile Navigation Targets', () => {
    it('targets valid application routes', () => {
      expect(ROUTES.home).toBe('/');
      expect(ROUTES.book).toBe('/book');
      expect(ROUTES.dashboard).toBe('/dashboard');
      expect(ROUTES.profile).toBe('/dashboard/profile');
    });
  });
});
