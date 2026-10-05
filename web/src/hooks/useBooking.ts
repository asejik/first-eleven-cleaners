'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BookingSubmissionPayload, BookingSubmissionResult } from '@/types';

// 1. Fetch available time slots for a given date
export function useAvailableSlots(date: string) {
  return useQuery({
    queryKey: ['slots', date],
    queryFn: async () => {
      if (!date) return { is_available: false, slots: [] };
      const res = await fetch(`/api/slots?date=${date}`);
      if (!res.ok) {
        throw new Error('Failed to load slots');
      }
      return res.json();
    },
    enabled: Boolean(date),
    staleTime: 30 * 1000, // 30s
  });
}


// 3. Validate Promo Code
export function useValidatePromoCode() {
  return useMutation({
    mutationFn: async ({ code, email }: { code: string; email?: string }) => {
      // The email lets the server apply the one-use-per-customer rule up front (P05 AR-02)
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.message || 'Invalid promo code');
      }
      return data;
    },
  });
}

// 4. Submit Order / Booking
export function useSubmitBooking() {
  const queryClient = useQueryClient();

  return useMutation<BookingSubmissionResult, Error, BookingSubmissionPayload>({
    mutationFn: async (bookingPayload: BookingSubmissionPayload): Promise<BookingSubmissionResult> => {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Booking failed');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
