import styles from '@/app/book/page.module.css';

interface BookingStepperProps {
  step: number;
}

const STEP_ITEMS = [
  { s: 1, label: 'Address' },
  { s: 2, label: 'Garments' },
  { s: 3, label: 'Schedule' },
  { s: 4, label: 'Review' },
  { s: 5, label: 'Payment' },
];

export function BookingStepper({ step }: BookingStepperProps) {
  if (step >= 6) return null;

  return (
    <div className={styles.stepperWrapper}>
      <div className={styles.stepper}>
        {STEP_ITEMS.map((item) => (
          <div
            key={item.s}
            className={`${styles.stepNode} ${step >= item.s ? styles.activeNode : ''} ${step === item.s ? styles.currentNode : ''}`}
          >
            <div className={styles.nodeCircle}>{step > item.s ? '✓' : item.s}</div>
            <span className={styles.nodeLabel}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
