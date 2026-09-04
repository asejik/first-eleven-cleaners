'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order, Claim } from '@/types';
import type { OrderStatusKey } from '@/lib/constants';

export interface MissionControlResponse {
  orders: Order[];
  claims: Claim[];
  stats: {
    active_count: number;
    total_count: number;
    today_revenue: number;
    all_time_revenue: number;
    total_lbs: number;
    total_pieces: number;
    labor: {
      estimated_cost: number;
      target_max_pct: number;
      current_pct: number;
      status: 'optimal' | 'alert';
    };
  } | null;
}

export function useMissionControl(options?: { page?: number; limit?: number; status?: string }) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 50;
  const status = options?.status ?? '';

  return useQuery<MissionControlResponse>({
    queryKey: ['mission_control', { page, limit, status }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (status) params.set('status', status);

      const headers: Record<string, string> = {};
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not get session token for mission control:', e);
      }

      const res = await fetch(`/api/mission-control?${params.toString()}`, { headers });
      if (!res.ok) throw new Error('Failed to load mission control data');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 25 * 1000, // 25s quiet live dashboard poll (egress-protected)
    refetchOnWindowFocus: true,
  });

}

export function useAdvanceOrderStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { order_id: string; new_stage: OrderStatusKey }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not get session token for advance stage:', e);
      }

      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'advance_stage', ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to advance order stage');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission_control'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useResolveClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      claim_id: string;
      resolution_notes: string;
      refund_amount?: number | null;
      claim_status?: 'resolved' | 'refunded';
    }) => {
      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve_claim', ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update claim');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission_control'] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
    },
  });
}
