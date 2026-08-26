'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Order } from '@/types';

export interface DriverManifestResponse {
  pickups: Order[];
  picked_up_history: Order[];
  deliveries: Order[];
  completed: Order[];
  meta: {
    total_pickups: number;
    total_picked_up: number;
    total_deliveries: number;
    selected_shift: string;
    date: string;
  };
}

export function useDriverManifest(shift: string = 'all') {
  return useQuery<DriverManifestResponse>({
    queryKey: ['driver_manifest', shift],
    queryFn: async () => {
      const res = await fetch(`/api/driver?shift=${encodeURIComponent(shift)}`);
      if (!res.ok) throw new Error('Failed to load driver route manifest');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 20 * 1000, // 20s poll for real-time stops
  });
}

export function useDriverAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      action: 'pickup_complete' | 'out_for_delivery' | 'delivery_complete';
      order_id: string;
      photo_url?: string;
      notes?: string;
    }) => {
      const res = await fetch('/api/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit driver action');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver_manifest'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['mission_control'] });
    },
  });
}
