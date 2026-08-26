'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Claim } from '@/types';

// Fetch claims for a specific order
export function useOrderClaims(orderId?: string) {
  return useQuery<{ claims: Claim[] }>({
    queryKey: ['claims', orderId || 'all'],
    queryFn: async () => {
      const url = orderId ? `/api/claims?order_id=${encodeURIComponent(orderId)}` : '/api/claims';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load claims');
      return res.json();
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000, // Poll for live admin updates
  });
}

// Fetch all claims for authenticated customer
export function useCustomerClaims() {
  return useQuery<{ claims: Claim[] }>({
    queryKey: ['claims', 'customer_all'],
    queryFn: async () => {
      const res = await fetch('/api/claims');
      if (!res.ok) throw new Error('Failed to load customer claims');
      return res.json();
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

// Submit a new claim
export function useSubmitClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      issue_type: string;
      description: string;
      photo_urls?: string[];
    }) => {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit claim');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claims', variables.order_id] });
      queryClient.invalidateQueries({ queryKey: ['order', variables.order_id] });
    },
  });
}
