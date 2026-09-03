import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import type { StaffMember } from '@/types';

const CreateStaffSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(7, 'Please enter a valid phone number'),
  role: z.enum(['driver', 'intake_staff']),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function GET(request: Request) {
  const auth = await verifyApiAuth(['admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const supabase = createAdminClient();

    // 1. Fetch all customer records
    const { data: customerRows, error: custErr } = await supabase
      .from('customers')
      .select('id, auth_id, email, phone, full_name, role, created_at, updated_at');

    if (custErr) {
      console.error('Error fetching customers for staff roster:', custErr);
      return NextResponse.json({ error: 'Failed to fetch staff roster' }, { status: 500 });
    }

    // 2. Fetch auth users to inspect metadata and banned/active status
    const { data: authData, error: authUsersErr } = await supabase.auth.admin.listUsers();
    if (authUsersErr) {
      console.error('Error fetching auth users for staff roster:', authUsersErr);
    }

    const authMap = new Map<string, {
      last_sign_in_at?: string | null;
      banned_until?: string | null;
      metaRole?: string;
      metaActive?: boolean;
    }>();

    if (authData?.users) {
      for (const u of authData.users) {
        authMap.set(u.id, {
          last_sign_in_at: u.last_sign_in_at,
          banned_until: u.banned_until,
          metaRole: u.user_metadata?.role,
          metaActive: u.user_metadata?.is_active !== false,
        });
      }
    }

    // 3. Filter and assemble staff members
    const staffList: StaffMember[] = [];

    for (const c of customerRows || []) {
      const emailLower = (c.email || '').toLowerCase().trim();
      const authInfo = c.auth_id ? authMap.get(c.auth_id) : undefined;

      // Determine staff role
      let staffRole: 'admin' | 'driver' | 'intake_staff' | null = null;
      if (emailLower === 'admin@firstelevencleaners.com' || emailLower === 'admin@firsteleven.com' || c.role === 'admin') {
        staffRole = 'admin';
      } else if (emailLower === 'driver@firstelevencleaners.com' || emailLower === 'driver@firsteleven.com' || authInfo?.metaRole === 'driver') {
        staffRole = 'driver';
      } else if (emailLower === 'intake@firstelevencleaners.com' || emailLower === 'intake@firsteleven.com' || authInfo?.metaRole === 'intake_staff') {
        staffRole = 'intake_staff';
      } else if (c.role === 'staff') {
        staffRole = (authInfo?.metaRole as 'driver' | 'intake_staff') || 'driver';
      }

      if (staffRole) {
        // Active if not banned and metaActive is not false
        const isBanned = Boolean(authInfo?.banned_until && new Date(authInfo.banned_until) > new Date());
        const isActive = !isBanned && (authInfo?.metaActive ?? true);

        staffList.push({
          id: c.id,
          auth_id: c.auth_id || '',
          email: c.email,
          phone: c.phone || '',
          full_name: c.full_name || '',
          role: staffRole,
          is_active: isActive,
          created_at: c.created_at,
          last_sign_in_at: authInfo?.last_sign_in_at || null,
        });
      }
    }

    // Sort: Admins first, then drivers, then intake
    staffList.sort((a, b) => {
      const roleOrder = { admin: 0, driver: 1, intake_staff: 2 };
      return roleOrder[a.role] - roleOrder[b.role];
    });

    return NextResponse.json({ staff: staffList });
  } catch (err: unknown) {
    console.error('Staff GET API exception:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyApiAuth(['admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await request.json();
    const parsed = CreateStaffSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid staff payload' },
        { status: 400 }
      );
    }

    const { full_name, email, phone, role, password } = parsed.data;
    const cleanEmail = email.toLowerCase().trim();
    const supabase = createAdminClient();

    // 1. Check if email already exists in customers table
    const { data: existingCust } = await supabase
      .from('customers')
      .select('id, auth_id, email, full_name, role')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (existingCust && (existingCust.role === 'staff' || existingCust.role === 'admin')) {
      return NextResponse.json(
        { error: `An active staff member with email ${cleanEmail} is already in your roster.` },
        { status: 409 }
      );
    }

    let authUserId: string = existingCust?.auth_id || '';

    // 2. Provision or update Auth User via Supabase Auth Admin
    if (authUserId) {
      // User has existing auth ID — update password, metadata, and ensure unbanned
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(authUserId, {
        password,
        ban_duration: 'none',
        user_metadata: {
          full_name,
          phone,
          role,
          is_active: true,
        },
      });

      if (updateAuthErr) {
        // If auth user was pruned or missing, recreate
        const { data: newAuth, error: createErr } = await supabase.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: { full_name, phone, role, is_active: true },
        });
        if (createErr || !newAuth?.user) {
          return NextResponse.json(
            { error: createErr?.message || 'Failed to configure authentication credentials' },
            { status: 400 }
          );
        }
        authUserId = newAuth.user.id;
      }
    } else {
      // No existing auth ID — attempt to create or find existing auth user by email
      const { data: authUser, error: createAuthErr } = await supabase.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name,
          phone,
          role,
          is_active: true,
        },
      });

      if (createAuthErr || !authUser?.user) {
        // If auth user already exists in Supabase Auth, find and update them
        const { data: authList } = await supabase.auth.admin.listUsers();
        const existingAuth = authList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

        if (existingAuth) {
          authUserId = existingAuth.id;
          await supabase.auth.admin.updateUserById(existingAuth.id, {
            password,
            ban_duration: 'none',
            user_metadata: { full_name, phone, role, is_active: true },
          });
        } else {
          console.error('Failed to create auth user for staff:', createAuthErr);
          return NextResponse.json(
            { error: createAuthErr?.message || 'Failed to create authentication account' },
            { status: 400 }
          );
        }
      } else {
        authUserId = authUser.user.id;
      }
    }

    // 3. Update or Insert customer record with role 'staff' (compliant with customers_role_check)
    let staffCustomerId: string = '';
    let createdAtTimestamp: string = new Date().toISOString();

    if (existingCust) {
      // Elevate existing customer account to staff
      const { data: updatedCust, error: updateCustErr } = await supabase
        .from('customers')
        .update({
          auth_id: authUserId,
          full_name,
          phone,
          role: 'staff',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingCust.id)
        .select()
        .single();

      if (updateCustErr) {
        console.error('Failed to update customer record for staff elevation:', updateCustErr);
        return NextResponse.json(
          { error: 'Failed to update staff record in database.' },
          { status: 500 }
        );
      }
      staffCustomerId = updatedCust.id;
      createdAtTimestamp = updatedCust.created_at;
    } else {
      // Insert new customer record
      const { data: newCust, error: insertCustErr } = await supabase
        .from('customers')
        .insert({
          auth_id: authUserId,
          email: cleanEmail,
          full_name,
          phone,
          role: 'staff',
        })
        .select()
        .single();

      if (insertCustErr) {
        console.error('Failed to insert customer record for staff:', insertCustErr);
        return NextResponse.json(
          { error: 'Failed to record staff profile in database.' },
          { status: 500 }
        );
      }
      staffCustomerId = newCust.id;
      createdAtTimestamp = newCust.created_at;
    }

    const createdStaff: StaffMember = {
      id: staffCustomerId,
      auth_id: authUserId,
      email: cleanEmail,
      phone,
      full_name,
      role,
      is_active: true,
      created_at: createdAtTimestamp,
      last_sign_in_at: null,
    };

    return NextResponse.json({
      success: true,
      staff: createdStaff,
      temporary_password: password,
      message: `${role === 'driver' ? 'Driver' : 'Intake Specialist'} ${full_name} successfully provisioned.`,
    });
  } catch (err: unknown) {
    console.error('Staff POST API exception:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
