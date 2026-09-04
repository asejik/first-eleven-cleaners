'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { ROUTES } from '@/lib/constants';
import { Button, Badge } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';
import styles from './Header.module.css';

const emptySubscribe = () => () => {};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const isMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  const handleLogout = () => {
    logout();
    setIsMobileOpen(false);
    router.push(ROUTES.login);
  };

  const isAuth = isMounted && isAuthenticated;
  const role: UserRole = user?.role || 'customer';

  // Role-specific home destination and navigation menus
  let homeHref: string = ROUTES.home;
  let navLinks: Array<{ href: string; label: string }> = [];

  if (isAuth && role === 'driver') {
    homeHref = ROUTES.staffDriver;
    navLinks = [
      { href: ROUTES.staffDriver, label: '🚐 Fleet Route Manifest' },
    ];
  } else if (isAuth && role === 'intake_staff') {
    homeHref = ROUTES.intake;
    navLinks = [
      { href: ROUTES.intake, label: '⚖️ Central Intake Station' },
    ];
  } else if (isAuth && role === 'admin') {
    homeHref = ROUTES.missionControl;
    navLinks = [
      { href: ROUTES.missionControl, label: '⚡ Mission Control' },
      { href: ROUTES.intake, label: '⚖️ Intake' },
      { href: ROUTES.staffDriver, label: '🚐 Driver' },
      { href: ROUTES.portal, label: '🏢 B2B Portal' },
      { href: `${ROUTES.dashboard}?view=customer`, label: '👤 Customer Preview' },
    ];
  } else {
    // Customer or Guest
    homeHref = ROUTES.home;
    navLinks = [
      { href: ROUTES.home, label: 'Home' },
      { href: ROUTES.about, label: 'About' },
      { href: ROUTES.pricing, label: 'Pricing' },
      { href: ROUTES.book, label: 'Book a Pickup' },
      { href: ROUTES.commercial, label: 'For Business' },
      ...(isAuth ? [{ href: ROUTES.dashboard, label: 'Dashboard' }] : []),
    ];
  }

  const firstName = user?.full_name?.split(' ')[0] || 'My Account';

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        {/* Logo */}
        <Link href={homeHref} className={styles.logo} aria-label="First Eleven Cleaners">
          <Image
            src="/logo.png"
            alt="First Eleven Cleaners"
            width={180}
            height={44}
            priority
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
              {role === 'driver' ? (
                <Badge variant="warning" size="md">
                  🚐 {user?.full_name || 'Driver'}
                </Badge>
              ) : role === 'intake_staff' ? (
                <Badge variant="info" size="md">
                  ⚖️ {user?.full_name || 'Intake Specialist'}
                </Badge>
              ) : role === 'admin' ? (
                <Badge variant="delivered" size="md">
                  ⚡ {user?.full_name || 'Plant Director'}
                </Badge>
              ) : (
                <>
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
                </>
              )}

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

          {isAuth && role === 'customer' && (
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
                {role === 'customer' && (
                  <Link href={ROUTES.book} onClick={() => setIsMobileOpen(false)}>
                    <Button variant="primary" fullWidth>Schedule Pickup</Button>
                  </Link>
                )}
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
