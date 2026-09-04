'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/types';

export interface DriverManifestResponse {
  pickups: Order[];
  picked_up_history: Order[];
  picked_up_completed?: Order[];
  ready_at_plant: Order[];
  deliveries: Order[];
  completed: Order[];
  meta: {
    total_pickups: number;
    total_picked_up: number;
    total_picked_up_completed?: number;
    total_ready_at_plant?: number;
    total_deliveries: number;
    total_completed?: number;
    selected_shift: string;
    date: string;
  };
}

export function useDriverManifest(shift: string = 'all') {
  return useQuery<DriverManifestResponse>({
    queryKey: ['driver_manifest', shift],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not retrieve session token for driver manifest:', e);
      }

      const res = await fetch(`/api/driver?shift=${encodeURIComponent(shift)}`, { headers });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load driver route manifest');
      }
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 25 * 1000, // 25s quiet background poll (egress-protected)
    refetchOnWindowFocus: true,
  });

}

export function useDriverAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      action: 'pickup_complete' | 'load_for_delivery' | 'out_for_delivery' | 'delivery_complete';
      order_id: string;
      photo_url?: string;
      notes?: string;
    }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not retrieve session token for driver action:', e);
      }

      const res = await fetch('/api/driver', {
        method: 'POST',
        headers,
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
