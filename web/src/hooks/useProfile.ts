'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface CustomerProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  preferred_channel?: 'sms' | 'whatsapp' | 'email';
  promo_opt_in?: boolean;
}

export interface ProfileUpdatePayload {
  full_name: string;
  phone: string;
  preferred_channel?: 'sms' | 'whatsapp' | 'email';
  promo_opt_in?: boolean;
}

export function useCustomerProfile() {
  return useQuery<{ profile: CustomerProfile }>({
    queryKey: ['customer-profile'],
    queryFn: async () => {
      const res = await fetch('/api/profile');
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ProfileUpdatePayload) => {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['customer-profile'], { profile: data.profile });
      queryClient.invalidateQueries({ queryKey: ['customer-profile'] });
    },
  });
}
