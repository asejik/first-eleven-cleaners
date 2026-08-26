'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { Customer } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface AuthState {
  user: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ error?: string; role?: string }>;
  signup: (data: { full_name: string; email: string; phone: string; password?: string }) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const MOCK_STORAGE_KEY = 'f11_mock_user';
const AUTH_CACHE_KEY = 'f11_auth_customer';

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const updateCustomerState = useCallback((newCustomer: Customer | null) => {
    setUser(newCustomer);
    if (typeof window !== 'undefined') {
      if (newCustomer) {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(newCustomer));
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
        localStorage.removeItem(MOCK_STORAGE_KEY);
        localStorage.removeItem('f11_customer_preferences');
      }
    }
  }, []);

  // Check if live Supabase is configured with real URL
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-project.supabase.co' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  useEffect(() => {
    // 1. Immediately hydrate from cache on client mount
    try {
      const cached = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
      if (cached) {
        setUser(JSON.parse(cached));
        setIsLoading(false);
      }
    } catch {}
    async function initAuth() {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Fetch customer record
            const { data } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', session.user.id)
              .maybeSingle();

            if (data) {
              updateCustomerState(data as Customer);
            } else {
              // Fallback user from auth session
              const fallback: Customer = {
                id: session.user.id,
                auth_id: session.user.id,
                email: session.user.email || '',
                phone: session.user.user_metadata?.phone || '',
                full_name: session.user.user_metadata?.full_name || (session.user.email?.split('@')[0] ?? 'Valued Customer'),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              updateCustomerState(fallback);
            }
          } else {
            updateCustomerState(null);
          }
        } catch {
          // Fallback to local storage
          loadLocalUser();
        }
      } else {
        loadLocalUser();
      }
      setIsLoading(false);
    }

    function loadLocalUser() {
      try {
        const stored = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
        if (stored) {
          updateCustomerState(JSON.parse(stored));
        }
      } catch {
        // Ignore local storage error
      }
    }

    initAuth();
  }, [isSupabaseConfigured, updateCustomerState]);

  const login = useCallback(
    async (email: string, pass: string): Promise<{ error?: string; role?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
          if (error) return { error: error.message };

          if (data.user) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', data.user.id)
              .maybeSingle();

            const role = (data.user.user_metadata?.role as string) || (email.includes('admin') ? 'admin' : email.includes('driver') ? 'driver' : email.includes('intake') ? 'intake_staff' : 'customer');

            if (customerData) {
              updateCustomerState(customerData as Customer);
              return { role };
            } else {
              const fallback: Customer = {
                id: data.user.id,
                auth_id: data.user.id,
                email: data.user.email || email,
                phone: data.user.user_metadata?.phone || '',
                full_name: data.user.user_metadata?.full_name || email.split('@')[0],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              updateCustomerState(fallback);
              return { role };
            }
          }
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }

      // Mock login for local testing
      const mockRole = email.includes('admin') ? 'admin' : email.includes('driver') ? 'driver' : email.includes('intake') ? 'intake_staff' : 'customer';
      const mockCustomer: Customer = {
        id: 'c0000000-0000-0000-0000-000000000001',
        email,
        phone: '(214) 555-0199',
        full_name: email.split('@')[0].replace('.', ' ').toUpperCase() || 'Valued Customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateCustomerState(mockCustomer);
      return { role: mockRole };
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const signup = useCallback(
    async (data: { full_name: string; email: string; phone: string; password?: string }): Promise<{ error?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password || 'TemporaryPassword123!',
            options: {
              data: {
                full_name: data.full_name,
                phone: data.phone,
              },
            },
          });
          if (authError) return { error: authError.message };

          if (authData.user) {
            // 1. First check if the Supabase Postgres trigger already created the customer record
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', authData.user.id)
              .maybeSingle();

            if (existingCustomer) {
              updateCustomerState(existingCustomer as Customer);
              return {};
            }

            // 2. If trigger didn't create it, safely upsert on email/auth_id
            const { data: upserted, error: upsertError } = await supabase
              .from('customers')
              .upsert(
                {
                  auth_id: authData.user.id,
                  email: data.email,
                  phone: data.phone,
                  full_name: data.full_name,
                },
                { onConflict: 'email' }
              )
              .select()
              .maybeSingle();

            if (!upsertError && upserted) {
              updateCustomerState(upserted as Customer);
              return {};
            }

            // 3. Fallback local representation for active session
            const fallback: Customer = {
              id: authData.user.id,
              auth_id: authData.user.id,
              email: data.email,
              phone: data.phone,
              full_name: data.full_name,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            updateCustomerState(fallback);
            return {};
          }
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }

      // Mock signup for local testing
      const mockCustomer: Customer = {
        id: crypto.randomUUID(),
        email: data.email,
        phone: data.phone,
        full_name: data.full_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateCustomerState(mockCustomer);
      return {};
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Ignore
      }
    }
    updateCustomerState(null);
  }, [isSupabaseConfigured, updateCustomerState]);

  const resetPassword = useCallback(
    async (email: string): Promise<{ error?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.resetPasswordForEmail(email);
          if (error) return { error: error.message };
          return {};
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }
      return {};
    },
    [isSupabaseConfigured]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
