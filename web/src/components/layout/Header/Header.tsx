'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Building2, Mail, MapPin, Phone, Scale, Settings, Truck, User, Zap, type LucideIcon } from 'lucide-react';
import { ROUTES, SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/constants';
import { SUPPORT_EMAIL_HREF, SUPPORT_PHONE_HREF } from '@/lib/contact';
import { Button, Badge, ButtonLink, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import type { UserRole } from '@/types';
import styles from './Header.module.css';
import { COMMERCIAL_PORTAL_ENABLED } from '@/lib/features';

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
  let navLinks: Array<{ href: string; label: string; icon?: LucideIcon }> = [];

  if (isAuth && role === 'driver') {
    homeHref = ROUTES.staffDriver;
    navLinks = [
      { href: ROUTES.staffDriver, label: 'Fleet Route Manifest', icon: Truck },
    ];
  } else if (isAuth && role === 'intake_staff') {
    homeHref = ROUTES.intake;
    navLinks = [
      { href: ROUTES.intake, label: 'Central Intake Station', icon: Scale },
    ];
  } else if (isAuth && role === 'admin') {
    homeHref = ROUTES.missionControl;
    navLinks = [
      { href: ROUTES.missionControl, label: 'Mission Control', icon: Zap },
      { href: ROUTES.intake, label: 'Intake', icon: Scale },
      { href: ROUTES.staffDriver, label: 'Driver', icon: Truck },
      ...(COMMERCIAL_PORTAL_ENABLED ? [{ href: ROUTES.portal, label: 'B2B Portal', icon: Building2 }] : []),
      { href: `${ROUTES.dashboard}?view=customer`, label: 'Customer Preview', icon: User },
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
  // Staff screens keep their own header; customers and visitors see how to reach us
  const showContact = !isAuth || role === 'customer';

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
              {link.icon && <Icon icon={link.icon} />} {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className={styles.desktopActions}>
          {/* Support phone for customers and visitors (client review 2026-10-20, #14) */}
          {showContact && (
            <a href={SUPPORT_PHONE_HREF} className={styles.phoneLink} aria-label={`Call us at ${SUPPORT_PHONE}`}>
              <Phone size={15} strokeWidth={2} aria-hidden="true" />
              <span className={styles.phoneNumber}>{SUPPORT_PHONE}</span>
            </a>
          )}
          {isAuth ? (
            <div className={styles.userActions}>
              {role === 'driver' ? (
                <Badge variant="warning" size="md">
                  <Icon icon={Truck} /> {user?.full_name || 'Driver'}
                </Badge>
              ) : role === 'intake_staff' ? (
                <Badge variant="info" size="md">
                  <Icon icon={Scale} /> {user?.full_name || 'Intake Specialist'}
                </Badge>
              ) : role === 'admin' ? (
                // The name links to Profile, where it can be changed (client review 2026-10-20)
                <Link href={ROUTES.profile} title="Edit your name and contact details" style={{ textDecoration: 'none' }}>
                  <Badge variant="delivered" size="md">
                    <Icon icon={Zap} /> {user?.full_name || 'Plant Director'}
                  </Badge>
                </Link>
              ) : (
                <>
                  <ButtonLink href={ROUTES.profile} variant="ghostLight" size="sm">
                    <Icon icon={User} /> {firstName}
                  </ButtonLink>
                  <ButtonLink href={ROUTES.book} variant="primary" size="sm">
                    + Schedule Pickup
                  </ButtonLink>
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
              <ButtonLink href={ROUTES.login} variant="ghostLight" size="sm">Log In</ButtonLink>
              <ButtonLink href={ROUTES.book} variant="primary" size="sm">Schedule Pickup</ButtonLink>
            </>
          )}
        </div>

        {/* Call button beside the menu on phones and tablets */}
        {showContact && (
          <a href={SUPPORT_PHONE_HREF} className={styles.mobileCall} aria-label={`Call us at ${SUPPORT_PHONE}`}>
            <Phone size={20} strokeWidth={2} aria-hidden="true" />
          </a>
        )}

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
              {link.icon && <Icon icon={link.icon} />} {link.label}
            </Link>
          ))}

          {isAuth && role === 'admin' && (
            <Link href={ROUTES.profile} className={styles.mobileNavLink} onClick={() => setIsMobileOpen(false)}>
              <Icon icon={User} /> My Profile
            </Link>
          )}

          {isAuth && role === 'customer' && (
            <>
              <Link
                href={ROUTES.profile}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon icon={User} /> Profile Settings
              </Link>
              <Link
                href={ROUTES.addresses}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon icon={MapPin} /> Saved Addresses
              </Link>
              <Link
                href={ROUTES.preferences}
                className={styles.mobileNavLink}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon icon={Settings} /> Eleven&apos;s Memory Preferences
              </Link>
            </>
          )}

          {showContact && (
            <div className={styles.mobileContact}>
              <a href={SUPPORT_PHONE_HREF} className={styles.mobileNavLink}>
                <Phone size={18} strokeWidth={2} aria-hidden="true" /> Call {SUPPORT_PHONE}
              </a>
              <a href={SUPPORT_EMAIL_HREF} className={styles.mobileNavLink}>
                <Mail size={18} strokeWidth={2} aria-hidden="true" /> {SUPPORT_EMAIL}
              </a>
            </div>
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
