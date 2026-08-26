'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Order } from '@/types';

export interface IntakeQueueResponse {
  queue: Order[];
  allOrders: Order[];
}

export function useIntakeQueue() {
  return useQuery<IntakeQueueResponse>({
    queryKey: ['intake_queue'],
    queryFn: async () => {
      const res = await fetch('/api/intake');
      if (!res.ok) throw new Error('Failed to load central intake queue');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 20 * 1000,
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
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
