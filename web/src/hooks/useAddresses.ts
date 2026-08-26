'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Address } from '@/types';

export function useCustomerAddresses() {
  return useQuery<{ addresses: Address[] }>({
    queryKey: ['addresses'],
    queryFn: async () => {
      const res = await fetch('/api/addresses');
      if (!res.ok) throw new Error('Failed to load saved addresses');
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

export function useAddAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      street: string;
      unit?: string | null;
      city?: string;
      state?: string;
      zip: string;
      delivery_notes?: string | null;
      is_default?: boolean;
    }) => {
      const res = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save address');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useSetDefaultAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addressId: string) => {
      const res = await fetch('/api/addresses', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address_id: addressId, is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update default address');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addressId: string) => {
      const res = await fetch(`/api/addresses?id=${encodeURIComponent(addressId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete address');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}
