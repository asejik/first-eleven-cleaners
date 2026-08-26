'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CustomerPreferences } from '@/types';

const PREFS_CACHE_KEY = 'f11_customer_preferences';

export function useCustomerPreferences() {
  return useQuery<{ preferences: CustomerPreferences | null }>({
    queryKey: ['preferences'],
    queryFn: async () => {
      const res = await fetch('/api/preferences');
      if (!res.ok) throw new Error('Failed to load customer preferences');
      const json = await res.json();
      if (json.preferences && typeof window !== 'undefined') {
        localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(json.preferences));
      }
      return json;
    },
    initialData: () => {
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem(PREFS_CACHE_KEY);
          if (cached) return { preferences: JSON.parse(cached) };
        } catch {}
      }
      return undefined;
    },
    staleTime: 60 * 1000,
  });
}

export function useUpdatePreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<CustomerPreferences>) => {
      const res = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save preferences');
      if (data.preferences && typeof window !== 'undefined') {
        localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(data.preferences));
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['preferences'], { preferences: data.preferences });
      queryClient.invalidateQueries({ queryKey: ['preferences'] });
    },
  });
}
