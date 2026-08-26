'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

export function useMissionControl() {
  return useQuery<MissionControlResponse>({
    queryKey: ['mission_control'],
    queryFn: async () => {
      const res = await fetch('/api/mission-control');
      if (!res.ok) throw new Error('Failed to load mission control data');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // 15s live dashboard poll
  });
}

export function useAdvanceOrderStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { order_id: string; new_stage: OrderStatusKey }) => {
      const res = await fetch('/api/mission-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
