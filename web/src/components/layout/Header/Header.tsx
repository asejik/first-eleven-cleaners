'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/constants';
import { Button } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import styles from './Header.module.css';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    await logout();
    setIsMobileOpen(false);
    router.push(ROUTES.home);
  };

  const isAuth = mounted && isAuthenticated;

  const navLinks = [
    { href: ROUTES.home, label: 'Home' },
    { href: ROUTES.pricing, label: 'Pricing' },
    { href: ROUTES.book, label: 'Book a Pickup' },
    { href: ROUTES.commercial, label: 'For Business' },
    ...(isAuth ? [{ href: ROUTES.dashboard, label: 'Dashboard' }] : []),
  ];

  const firstName = user?.full_name?.split(' ')[0] || 'My Account';

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* Logo */}
        <Link href={ROUTES.home} className={styles.logo} aria-label="First Eleven Cleaners — Home">
          <Image
            src="/logo.png?v=2"
            alt="First Eleven Cleaners"
            width={180}
            height={44}
            priority
            unoptimized
            style={{ height: '40px', width: 'auto', objectFit: 'contain' }}
            className={styles.logoImg}
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${pathname === link.href ? styles.active : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className={styles.desktopActions}>
          {isAuth ? (
            <div className={styles.userActions}>
              <Link href={ROUTES.profile}>
                <Button variant="ghostLight" size="sm">
                  👤 {firstName}
                </Button>
              </Link>
              <Link href={ROUTES.book}>
                <Button variant="primary" size="sm">
                  + Schedule Pickup
                </Button>
              </Link>
              <button
                type="button"
                className={styles.logoutBtn}
                onClick={handleLogout}
                title="Log out of your account"
              >
                Log Out
              </button>
            </div>
          ) : (
            <>
              <Link href={ROUTES.login}>
                <Button variant="ghostLight" size="sm">Log In</Button>
              </Link>
              <Link href={ROUTES.book}>
                <Button variant="primary" size="sm">Schedule Pickup</Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className={styles.mobileMenuBtn}
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          aria-expanded={isMobileOpen}
          aria-label={isMobileOpen ? 'Close menu' : 'Open menu'}
        >
          <span className={`${styles.hamburger} ${isMobileOpen ? styles.hamburgerOpen : ''}`}>
            <span />
            <span />
            <span />
          </span>
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMobileOpen && (
        <nav className={styles.mobileNav} aria-label="Mobile navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.mobileNavLink} ${pathname === link.href ? styles.active : ''}`}
              onClick={() => setIsMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {isAuth && (
            <>
              <Link
                href={ROUTES.profile}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                👤 Profile Settings
              </Link>
              <Link
                href={ROUTES.addresses}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                📍 Saved Addresses
              </Link>
              <Link
                href={ROUTES.preferences}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                ⚙️ Eleven&apos;s Memory Preferences
              </Link>
            </>
          )}
          <div className={styles.mobileActions}>
            {isAuth ? (
              <>
                <Link href={ROUTES.book} onClick={() => setIsMobileOpen(false)}>
                  <Button variant="primary" fullWidth>Schedule Pickup</Button>
                </Link>
                <Button variant="outlineLight" fullWidth onClick={handleLogout}>
                  Log Out ({firstName})
                </Button>
              </>
            ) : (
              <>
                <Link href={ROUTES.login} onClick={() => setIsMobileOpen(false)}>
                  <Button variant="outlineLight" fullWidth>Log In</Button>
                </Link>
                <Link href={ROUTES.book} onClick={() => setIsMobileOpen(false)}>
                  <Button variant="primary" fullWidth>Schedule Pickup</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
