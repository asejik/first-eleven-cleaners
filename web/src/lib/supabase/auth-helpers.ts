import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { Customer, UserRole } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuthCustomerResult {
  user: User | null;
  customer: Customer | null;
  error?: string;
}

export interface ApiAuthVerificationResult {
  errorResponse?: NextResponse;
  customer: Customer | null;
  user: User | null;
}

/**
 * Centralized backend authentication and customer resolution helper.
 * Uses the cookie-based server client to resolve the authenticated Supabase user,
 * and fetches the corresponding customer record with only required columns.
 * Eliminates redundant database roundtrips and inconsistent lookups across API routes.
 */
export async function getAuthenticatedCustomer(request?: Request): Promise<AuthCustomerResult> {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return { user: null, customer: null };
  }

  try {
    let user: User | null = null;

    // 1. Prioritize Bearer token from request Authorization header if present
    if (request) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        const adminClient = createAdminClient();
        const { data: tokenData, error: tokenErr } = await adminClient.auth.getUser(token);
        if (!tokenErr && tokenData?.user) {
          user = tokenData.user;
        }
      }
    }

    // 2. Fall back to cookie-based session, verified with Supabase Auth (SEC-01).
    // Never use getSession() here: it returns the cookie contents unverified, so a forged cookie would be trusted.
    if (!user) {
      const authClient = await createClient();
      const {
        data: { user: verifiedUser },
        error: authError,
      } = await authClient.auth.getUser();

      if (!authError && verifiedUser) {
        user = verifiedUser;
      }
    }

    if (!user) {
      return { user: null, customer: null };
    }

    const supabase = createAdminClient();

    // Resolve the customer strictly by auth_id (SEC-03). Guest records are linked to an
    // account by database triggers only after the email address is verified.
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, auth_id, email, phone, full_name, role, created_at, updated_at')
      .eq('auth_id', user.id)
      .maybeSingle();

    if (customerError) {
      console.error('Customer lookup error in auth helper:', customerError);
      return { user, customer: null, error: customerError.message };
    }

    return {
      user,
      customer: (customer as Customer) || null,
    };
  } catch (err) {
    console.error('getAuthenticatedCustomer exception:', err);
    return { user: null, customer: null, error: (err as Error).message };
  }
}

/**
 * Enforces authentication and authorized role membership on backend API handlers.
 * Returns { errorResponse } if unauthorized/forbidden, or { customer, user } if authorized.
 */
export async function verifyApiAuth(
  allowedRoles?: UserRole[],
  request?: Request
): Promise<ApiAuthVerificationResult> {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  // If Supabase is unconfigured in local development, provide mock admin access for UI testing
  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      return {
        customer: null,
        user: null,
        errorResponse: NextResponse.json(
          { error: 'Server configuration error: Database connection is not configured.' },
          { status: 500 }
        ),
      };
    }

    const mockCustomer: Customer = {
      id: 'c0000000-0000-0000-0000-000000000001',
      email: 'admin@firstelevencleaners.com',
      phone: '(214) 555-0199',
      full_name: 'Operations Admin',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { customer: mockCustomer, user: null };
  }

  const { customer, user } = await getAuthenticatedCustomer(request);

  if (!user || !customer) {
    return {
      customer: null,
      user: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      ),
    };
  }

  const email = (user.email || customer.email || '').toLowerCase().trim();

  // Authoritative role resolution: the server-controlled customers.role column only (SEC-02).
  // Never grant roles by email address or user-editable metadata.
  let userRole: UserRole = 'customer';
  if (customer.role && ['admin', 'driver', 'intake_staff', 'customer'].includes(customer.role)) {
    userRole = customer.role;
  }

  // Construct full set of effective roles for permission checks
  const effectiveRoles = new Set<string>([userRole]);
  if (userRole === 'admin') {
    effectiveRoles.add('admin');
    effectiveRoles.add('intake_staff');
    effectiveRoles.add('driver');
  }
  if (userRole === 'intake_staff') {
    effectiveRoles.add('intake_staff');
  }
  if (userRole === 'driver') {
    effectiveRoles.add('driver');
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isPermitted = allowedRoles.some((r) => effectiveRoles.has(r));
    if (!isPermitted) {
      console.error('[verifyApiAuth 403 Forbidden]:', {
        email,
        userRole,
        customerRole: customer.role,
        effectiveRoles: Array.from(effectiveRoles),
        allowedRoles,
      });
      return {
        customer,
        user,
        errorResponse: NextResponse.json(
          {
            error: `Forbidden: Account role '${userRole}' is not permitted to access this resource.`,
            detectedEmail: email,
            detectedRole: userRole,
            effectiveRoles: Array.from(effectiveRoles),
          },
          { status: 403 }
        ),
      };
    }
  }

  return { customer: { ...customer, role: userRole }, user };
}
