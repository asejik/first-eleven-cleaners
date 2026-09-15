'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import styles from './SmsConsentBlock.module.css';

export interface SmsConsentBlockProps {
  smsConsent: boolean;
  onSmsConsentChange: (checked: boolean) => void;
  smsPromotionsConsent: boolean;
  onSmsPromotionsConsentChange: (checked: boolean) => void;
  idPrefix?: string;
  className?: string;
}

export const SMS_CONSENT_TRANSACTIONAL_TEXT =
  'I agree to receive order status updates, service notifications, and delivery alerts from First Eleven Cleaners by SMS. Message frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a condition of purchase.';

export const SMS_CONSENT_PROMOTIONAL_TEXT =
  'Also send me occasional offers and promotions from First Eleven Cleaners by SMS. Msg & data rates may apply. Reply STOP to cancel.';

export function SmsConsentBlock({
  smsConsent,
  onSmsConsentChange,
  smsPromotionsConsent,
  onSmsPromotionsConsentChange,
  idPrefix = 'f11_sms',
  className = '',
}: SmsConsentBlockProps) {
  const transactionalId = `${idPrefix}_consent_order_updates`;
  const promotionalId = `${idPrefix}_consent_promotions`;

  return (
    <div className={`${styles.consentBlock} ${className}`}>
      {/* 1. Transactional / Order Updates (Optional, Unchecked by default) */}
      <label htmlFor={transactionalId} className={styles.checkboxItem}>
        <input
          id={transactionalId}
          type="checkbox"
          checked={smsConsent}
          onChange={(e) => onSmsConsentChange(e.target.checked)}
          className={styles.checkboxInput}
        />
        <span className={styles.checkboxLabel}>{SMS_CONSENT_TRANSACTIONAL_TEXT}</span>
      </label>

      {/* 2. Promotional / Marketing Updates (Optional, Unchecked by default) */}
      <label htmlFor={promotionalId} className={styles.checkboxItem}>
        <input
          id={promotionalId}
          type="checkbox"
          checked={smsPromotionsConsent}
          onChange={(e) => onSmsPromotionsConsentChange(e.target.checked)}
          className={styles.checkboxInput}
        />
        <span className={styles.checkboxLabel}>{SMS_CONSENT_PROMOTIONAL_TEXT}</span>
      </label>

      {/* 3. Mandatory Legal Policy Disclosures */}
      <div className={styles.legalLinks}>
        Review our{' '}
        <Link href={ROUTES.privacy} target="_blank" className={styles.link}>
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href={ROUTES.terms} target="_blank" className={styles.link}>
          Terms &amp; Conditions
        </Link>
        .
      </div>
    </div>
  );
}
