'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { Customer, UserRole } from '@/types';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  determineRole,
  getStoredCustomer,
  saveStoredCustomer,
  clearStoredCustomer,
  hasFreshCachedSession,
  createMockCustomer,
} from '@/lib/mock-auth';

interface AuthState {
  user: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ error?: string; role?: UserRole }>;
  signup: (data: {
    full_name: string;
    email: string;
    phone: string;
    password?: string;
    sms_consent?: boolean;
    sms_promotions_consent?: boolean;
  }) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(getStoredCustomer);
  const [isLoading, setIsLoading] = useState<boolean>(() => !hasFreshCachedSession());

  const updateCustomerState = useCallback((newCustomer: Customer | null) => {
    if (newCustomer && !newCustomer.role) {
      newCustomer.role = determineRole(newCustomer.email);
    }
    setUser(newCustomer);
    if (newCustomer) {
      saveStoredCustomer(newCustomer);
    } else {
      clearStoredCustomer();
    }
  }, []);

  // Check if live Supabase is configured with real URL
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-project.supabase.co' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  useEffect(() => {
    let isMounted = true;
    const hasFresh = hasFreshCachedSession();

    async function initAuth() {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          // Instant session check from local storage (0ms) before remote getUser fallback
          const { data: sessionData } = await supabase.auth.getSession();
          let authUser = sessionData?.session?.user || null;

          if (!authUser) {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (!userError && userData?.user) {
              authUser = userData.user;
            }
          }

          if (!isMounted) return;

          if (authUser) {
            // Fetch customer record with specific columns to minimize network egress
            const { data } = await supabase
              .from('customers')
              .select('id, auth_id, email, phone, full_name, role, created_at, updated_at')
              .eq('auth_id', authUser.id)
              .maybeSingle();

            if (!isMounted) return;

            const role = determineRole(
              authUser.email || '',
              authUser.user_metadata?.role,
              data?.role
            );

            if (data) {
              const fullCustomer: Customer = {
                ...(data as Customer),
                role,
              };
              updateCustomerState(fullCustomer);
            } else {
              // Fallback user from auth session
              const fallback: Customer = {
                id: authUser.id,
                auth_id: authUser.id,
                email: authUser.email || '',
                phone: authUser.user_metadata?.phone || '',
                full_name: authUser.user_metadata?.full_name || (authUser.email?.split('@')[0] ?? 'Valued Customer'),
                role,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              updateCustomerState(fallback);
            }
          } else {
            updateCustomerState(null);
          }
        } catch {
          if (isMounted) loadLocalUser();
        }
      } else {
        loadLocalUser();
      }
      if (isMounted) {
        setIsLoading(false);
      }
    }

    function loadLocalUser() {
      const stored = getStoredCustomer();
      if (stored) {
        updateCustomerState(stored);
      }
    }

    // Only make network call if cache was expired or missing
    if (!hasFresh) {
      initAuth();
    }

    // Subscribe to auth state changes for real-time reactivity without polling
    let authSubscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
          if (!isMounted) return;
          if (event === 'SIGNED_OUT') {
            updateCustomerState(null);
          } else if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
            // Re-sync session
            initAuth();
          }
        });
        authSubscription = subscription;
      } catch {}
    }

    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [isSupabaseConfigured, updateCustomerState]);

  const login = useCallback(
    async (email: string, pass: string): Promise<{ error?: string; role?: UserRole }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
          if (error) {
            return { error: error.message };
          }

          if (data.user) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', data.user.id)
              .maybeSingle();

            const role = determineRole(
              data.user.email || email,
              data.user.user_metadata?.role,
              customerData?.role
            );

            if (customerData) {
              const fullCust: Customer = {
                ...(customerData as Customer),
                role,
              };
              updateCustomerState(fullCust);
              return { role };
            } else {
              const fallback: Customer = {
                id: data.user.id,
                auth_id: data.user.id,
                email: data.user.email || email,
                phone: data.user.user_metadata?.phone || '',
                full_name: data.user.user_metadata?.full_name || email.split('@')[0],
                role,
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

      // Mock login for local dev environment
      const mockCustomer = createMockCustomer(email);
      updateCustomerState(mockCustomer);
      return { role: mockCustomer.role };
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const signup = useCallback(
    async (data: {
      full_name: string;
      email: string;
      phone: string;
      password?: string;
      sms_consent?: boolean;
      sms_promotions_consent?: boolean;
    }): Promise<{ error?: string }> => {
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
                sms_consent: Boolean(data.sms_consent),
                sms_promotions_consent: Boolean(data.sms_promotions_consent),
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
              await supabase
                .from('customers')
                .update({
                  sms_consent: Boolean(data.sms_consent),
                  sms_promotions_consent: Boolean(data.sms_promotions_consent),
                  sms_consent_at: data.sms_consent ? new Date().toISOString() : null,
                })
                .eq('id', existingCustomer.id);
              updateCustomerState({
                ...(existingCustomer as Customer),
                sms_consent: Boolean(data.sms_consent),
                sms_promotions_consent: Boolean(data.sms_promotions_consent),
              });
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
                  sms_consent: Boolean(data.sms_consent),
                  sms_promotions_consent: Boolean(data.sms_promotions_consent),
                  sms_consent_at: data.sms_consent ? new Date().toISOString() : null,
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
              sms_consent: Boolean(data.sms_consent),
              sms_promotions_consent: Boolean(data.sms_promotions_consent),
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

      // Mock signup for local dev environment
      const mockCustomer = createMockCustomer(data.email, {
        full_name: data.full_name,
        phone: data.phone,
      });
      mockCustomer.sms_consent = Boolean(data.sms_consent);
      mockCustomer.sms_promotions_consent = Boolean(data.sms_promotions_consent);
      updateCustomerState(mockCustomer);
      return {};
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const logout = useCallback(async () => {
    // 1. Immediately clear local auth state and storage in 0ms
    updateCustomerState(null);

    // 2. Perform remote Supabase signOut asynchronously without blocking UI navigation
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient();
        Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]).catch(() => {});
      } catch {
        // Ignore
      }
    }
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
