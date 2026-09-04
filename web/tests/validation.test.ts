import { describe, it, expect } from 'vitest';
import { z } from 'zod';

const BookingSchema = z.object({
  customer: z.object({
    full_name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    email: z.string().trim().email('Invalid email address'),
    phone: z.string().trim().min(7, 'Phone number is required'),
  }),
  address: z.object({
    street: z.string().trim().min(5, 'Street address is required'),
    unit: z.string().optional(),
    city: z.string().default('Dallas'),
    state: z.string().default('TX'),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid 5-digit ZIP code'),
    delivery_notes: z.string().optional(),
  }),
  services: z.object({
    type: z.enum(['dry_clean', 'wash_fold', 'mixed']),
    dry_clean_items: z.array(z.object({
      garment_type: z.string(),
      quantity: z.number().int().positive(),
    })).optional().default([]),
    estimated_weight_lbs: z.number().nonnegative().optional().default(0),
  }),
  schedule: z.object({
    pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid YYYY-MM-DD date required'),
    pickup_window: z.enum(['morning', 'evening']),
    express_tier: z.enum(['standard', 'express_8hr', 'express_4hr']).default('standard'),
    frequency: z.enum(['one_time', 'weekly', 'biweekly']).optional().default('one_time'),
  }),
  pricing: z.object({
    subtotal: z.number().nonnegative(),
    discount_amount: z.number().nonnegative().default(0),
    total: z.number().nonnegative(),
    promo_code: z.string().optional().nullable(),
  }),
  payment_method: z.object({
    card_brand: z.string().default('visa'),
    last_4: z.string().default('4242'),
    payment_token: z.string().optional().nullable(),
  }).optional(),
});

const ProfileUpdateSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().min(7, 'Please enter a valid phone number').max(30),
  preferred_channel: z.enum(['sms', 'whatsapp', 'email']).optional().default('sms'),
  promo_opt_in: z.boolean().optional().default(true),
});

describe('Zod Request Validation Schemas', () => {
  describe('BookingSchema', () => {
    it('validates a complete, authentic booking submission', () => {
      const payload = {
        customer: {
          full_name: 'Dr. Alex Morgan',
          email: 'alex@example.com',
          phone: '(214) 555-0199',
        },
        address: {
          street: '4514 Travis St',
          unit: 'Apt 304',
          city: 'Dallas',
          state: 'TX',
          zip: '75205',
          delivery_notes: 'Leave behind porch chair',
        },
        services: {
          type: 'mixed',
          dry_clean_items: [{ garment_type: 'shirt_blouse', quantity: 3 }],
          estimated_weight_lbs: 20,
        },
        schedule: {
          pickup_date: '2026-09-10',
          pickup_window: 'morning',
          express_tier: 'standard',
          frequency: 'weekly',
        },
        pricing: {
          subtotal: 86.91,
          discount_amount: 13.04,
          total: 73.87,
          promo_code: 'KICKOFF15',
        },
        payment_method: {
          card_brand: 'visa',
          last_4: '4242',
          payment_token: 'cnon:CBASEBqCg0X71P1g5_P1wexample',
        },
      };

      const result = BookingSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.payment_method?.payment_token).toBe('cnon:CBASEBqCg0X71P1g5_P1wexample');
      }
    });

    it('rejects an invalid email format', () => {
      const payload = {
        customer: { full_name: 'Alex', email: 'invalid-email', phone: '2145550199' },
        address: { street: '123 Main St', zip: '75205' },
        services: { type: 'wash_fold' },
        schedule: { pickup_date: '2026-09-10', pickup_window: 'morning' },
        pricing: { subtotal: 45, total: 45 },
      };

      const result = BookingSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Invalid email');
      }
    });

    it('rejects an invalid ZIP code format', () => {
      const payload = {
        customer: { full_name: 'Alex', email: 'alex@example.com', phone: '2145550199' },
        address: { street: '123 Main St', zip: 'ABCDE' },
        services: { type: 'wash_fold' },
        schedule: { pickup_date: '2026-09-10', pickup_window: 'morning' },
        pricing: { subtotal: 45, total: 45 },
      };

      const result = BookingSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('valid 5-digit ZIP code');
      }
    });
  });

  describe('ProfileUpdateSchema', () => {
    it('validates a valid profile update with TCPA notification preference', () => {
      const payload = {
        full_name: 'Elena Rostova',
        phone: '469-555-8821',
        preferred_channel: 'whatsapp',
        promo_opt_in: true,
      };

      const result = ProfileUpdateSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects an empty name or too short name', () => {
      const payload = {
        full_name: 'E',
        phone: '469-555-8821',
      };

      const result = ProfileUpdateSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });
  });
});
