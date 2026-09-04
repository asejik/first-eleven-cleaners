'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/types';

export interface IntakeQueueResponse {
  queue: Order[];
  intakeHistory?: Order[];
  todayIntakeCount?: number;
  allOrders: Order[];
}

export function useIntakeQueue() {
  return useQuery<IntakeQueueResponse>({
    queryKey: ['intake_queue'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not retrieve session token for intake queue:', e);
      }

      const res = await fetch('/api/intake', { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.error('Failed to load central intake queue:', errJson);
        throw new Error(errJson.error || 'Failed to load central intake queue');
      }
      return res.json();
    },
    staleTime: 3 * 1000,
    refetchInterval: 5 * 1000,
    refetchOnWindowFocus: true,
  });

}

export function useSubmitIntake() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      weight_lbs: number;
      dry_clean_items: Array<{ garment_type: string; quantity: number; notes?: string }>;
      photos: Array<{ photo_url: string; condition_notes?: string }>;
      advance_to_cleaning?: boolean;
      intake_notes?: string;
    }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not retrieve session token for intake submit:', e);
      }

      const res = await fetch('/api/intake', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to finalize intake');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intake_queue'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['mission_control'] });
    },
  });
}
