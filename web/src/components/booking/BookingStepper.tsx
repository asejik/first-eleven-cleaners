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
      {/* An ordered list with the current step marked, so screen readers can say where you are (SR-03) */}
      <ol className={styles.stepper} aria-label="Booking progress">
        {STEP_ITEMS.map((item) => (
          <li
            key={item.s}
            className={`${styles.stepNode} ${step >= item.s ? styles.activeNode : ''} ${step === item.s ? styles.currentNode : ''}`}
            aria-current={step === item.s ? 'step' : undefined}
          >
            <div className={styles.nodeCircle} aria-hidden="true">{step > item.s ? '✓' : item.s}</div>
            <span className={styles.nodeLabel}>
              {item.label}
              {step > item.s && <span className="sr-only">, completed</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
