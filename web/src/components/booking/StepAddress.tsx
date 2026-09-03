import { Card, Input, Button } from '@/components/ui';
import styles from '@/app/book/page.module.css';

interface StepAddressProps {
  fullName: string;
  setFullName: (val: string) => void;
  email: string;
  setEmail: (val: string) => void;
  phone: string;
  setPhone: (val: string) => void;
  street: string;
  setStreet: (val: string) => void;
  unit: string;
  setUnit: (val: string) => void;
  zip: string;
  setZip: (val: string) => void;
  deliveryNotes: string;
  setDeliveryNotes: (val: string) => void;
  isValid: boolean;
  onContinue: () => void;
}

export function StepAddress({
  fullName,
  setFullName,
  email,
  setEmail,
  phone,
  setPhone,
  street,
  setStreet,
  unit,
  setUnit,
  zip,
  setZip,
  deliveryNotes,
  setDeliveryNotes,
  isValid,
  onContinue,
}: StepAddressProps) {
  return (
    <Card variant="bordered" padding="lg" className={styles.flowCard}>
      <h1 className={styles.cardTitle}>Where Should We Pick Up?</h1>
      <p className={styles.cardSubtitle}>
        Door-to-door coverage across the Dallas-Fort Worth Metroplex.
      </p>

      <div className={styles.formGrid}>
        <Input
          label="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Dr. Alex Morgan"
          required
        />
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="alex@example.com"
          required
        />
        <Input
          label="Mobile Phone (for SMS updates)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(214) 555-0199"
          required
          helperText="We will send your driver ETA & photo receipt to this number"
        />
        <Input
          label="Street Address"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          placeholder="4514 Travis St"
          required
        />
        <div className={styles.rowTwo}>
          <Input
            label="Apt / Suite / Gate Code"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Apt 304, Gate #1100"
          />
          <Input
            label="ZIP Code"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="75205"
            required
          />
        </div>
        <Input
          label="Delivery & Porch Instructions (Optional)"
          value={deliveryNotes}
          onChange={(e) => setDeliveryNotes(e.target.value)}
          placeholder="Leave on front porch behind planter, or with building concierge"
        />
      </div>

      <div className={styles.smartCoverageNotice}>
        <span className={styles.noticeEmoji}>🗺️</span>
        <div>
          <strong>Smart Coverage:</strong> No restrictive ZIP fences. We serve all of DFW. Your area is matched with dedicated morning and evening routes.
        </div>
      </div>

      <div className={styles.actionRow}>
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          disabled={!isValid}
        >
          Continue to Garments →
        </Button>
      </div>
    </Card>
  );
}
