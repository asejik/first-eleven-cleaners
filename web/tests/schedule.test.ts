import { describe, it, expect } from 'vitest';
import { PROCESSING_HOURS, OPERATING_DAYS, DAY_OFF } from '@/lib/constants';

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function adjustForSundayClosure(date: Date): Date {
  const adjusted = new Date(date);
  if (adjusted.getDay() === 0) {
    adjusted.setDate(adjusted.getDate() + 1); // Rollover Sunday to Monday
  }
  return adjusted;
}

function calculateEstimatedDelivery(pickupDateStr: string, tier: 'standard' | 'express_8hr' | 'express_4hr' = 'standard'): string {
  const [y, m, d] = pickupDateStr.split('-').map(Number);
  const delivery = new Date(y, m - 1, d);
  if (tier === 'standard') {
    delivery.setDate(delivery.getDate() + 2); // 48 hours standard
  } else {
    delivery.setDate(delivery.getDate() + 1); // Rush express
  }
  // Plant closed Sunday: rollover to Monday
  if (delivery.getDay() === 0) {
    delivery.setDate(delivery.getDate() + 1);
  }
  return formatLocalDate(delivery);
}

describe('Scheduling & Operational Calendar Rules', () => {
  it('defines 6 operating days (Monday through Saturday) and Sunday as day off', () => {
    expect(OPERATING_DAYS).toHaveLength(6);
    expect(OPERATING_DAYS).toContain('Monday');
    expect(OPERATING_DAYS).toContain('Saturday');
    expect(DAY_OFF).toBe('Sunday');
    expect(PROCESSING_HOURS).toBe(48);
  });

  describe('Sunday Plant Closure Rollover', () => {
    it('rolls over a Sunday date to Monday', () => {
      // 2026-09-06 is a Sunday
      const sunday = new Date(2026, 8, 6);
      expect(sunday.getDay()).toBe(0);

      const adjusted = adjustForSundayClosure(sunday);
      expect(adjusted.getDay()).toBe(1); // Monday
      expect(formatLocalDate(adjusted)).toBe('2026-09-07');
    });

    it('keeps weekdays unchanged', () => {
      // 2026-09-07 is a Monday
      const monday = new Date(2026, 8, 7);
      const adjusted = adjustForSundayClosure(monday);
      expect(formatLocalDate(adjusted)).toBe('2026-09-07');
    });
  });

  describe('48-Hour Match-Ready Guarantee', () => {
    it('calculates standard delivery date as 2 days out on normal weekdays', () => {
      // Tuesday 2026-09-08 -> Thursday 2026-09-10
      const delivery = calculateEstimatedDelivery('2026-09-08', 'standard');
      expect(delivery).toBe('2026-09-10');
    });

    it('rolls over Friday pickup delivery from Sunday to Monday', () => {
      // Friday 2026-09-11 + 2 days = Sunday 2026-09-13 -> Rolled over to Monday 2026-09-14
      const delivery = calculateEstimatedDelivery('2026-09-11', 'standard');
      expect(delivery).toBe('2026-09-14');
    });

    it('calculates express rush delivery as next-day (skipping Sunday)', () => {
      // Wednesday 2026-09-09 -> Thursday 2026-09-10
      const weekdayExpress = calculateEstimatedDelivery('2026-09-09', 'express_8hr');
      expect(weekdayExpress).toBe('2026-09-10');

      // Saturday 2026-09-12 -> Sunday (closed) -> Monday 2026-09-14
      const saturdayExpress = calculateEstimatedDelivery('2026-09-12', 'express_8hr');
      expect(saturdayExpress).toBe('2026-09-14');
    });
  });
});
