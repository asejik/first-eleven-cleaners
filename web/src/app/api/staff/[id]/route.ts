import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import type { StaffMember } from '@/types';

const UpdateStaffSchema = z.object({
  full_name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  role: z.enum(['driver', 'intake_staff']).optional(),
  is_active: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiAuth(['admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Staff ID is required.' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const parsed = UpdateStaffSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid update payload' },
        { status: 400 }
      );
    }

    const updates = parsed.data;
    const supabase = createAdminClient();

    // 1. Fetch existing customer record
    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('id, auth_id, email, phone, full_name, role')
      .eq('id', id)
      .single();

    if (fetchErr || !customer) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }

    // Protect primary admin account from deactivation or role downgrades
    const isPrimaryAdmin =
      customer.email?.toLowerCase().trim() === 'admin@firstelevencleaners.com' ||
      customer.email?.toLowerCase().trim() === 'admin@firsteleven.com';

    if (isPrimaryAdmin && updates.is_active === false) {
      return NextResponse.json(
        { error: 'Primary Administrator account cannot be deactivated.' },
        { status: 400 }
      );
    }

    // 2. Update customer table fields
    const customerFieldsToUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.full_name) customerFieldsToUpdate.full_name = updates.full_name;
    if (updates.phone) customerFieldsToUpdate.phone = updates.phone;

    const { data: updatedCust, error: custUpdateErr } = await supabase
      .from('customers')
      .update(customerFieldsToUpdate)
      .eq('id', id)
      .select()
      .single();

    if (custUpdateErr) {
      console.error('Failed to update customer row for staff:', custUpdateErr);
      return NextResponse.json({ error: 'Failed to update database profile.' }, { status: 500 });
    }

    // 3. If user has an auth_id, update Auth user metadata, ban duration, or password
    if (customer.auth_id) {
      const authUpdates: {
        password?: string;
        user_metadata?: Record<string, unknown>;
        ban_duration?: string;
      } = {};

      if (updates.password) {
        authUpdates.password = updates.password;
      }

      if (updates.is_active !== undefined) {
        authUpdates.ban_duration = updates.is_active === false ? '876000h' : 'none';
      }

      // Fetch current metadata to preserve existing properties
      const { data: currentAuthUser } = await supabase.auth.admin.getUserById(customer.auth_id);
      const existingMeta = currentAuthUser?.user?.user_metadata || {};

      authUpdates.user_metadata = {
        ...existingMeta,
        full_name: updates.full_name || updatedCust.full_name,
        phone: updates.phone || updatedCust.phone,
        ...(updates.role ? { role: updates.role } : {}),
        ...(updates.is_active !== undefined ? { is_active: updates.is_active } : {}),
      };

      const { error: authUpdateErr } = await supabase.auth.admin.updateUserById(
        customer.auth_id,
        authUpdates
      );

      if (authUpdateErr) {
        console.error('Failed to update auth properties for staff:', authUpdateErr);
      }
    }

    const effectiveRole = updates.role || (customer.role === 'admin' ? 'admin' : 'driver');

    const resultStaff: StaffMember = {
      id: updatedCust.id,
      auth_id: updatedCust.auth_id || '',
      email: updatedCust.email,
      phone: updatedCust.phone || '',
      full_name: updatedCust.full_name || '',
      role: isPrimaryAdmin ? 'admin' : effectiveRole,
      is_active: updates.is_active !== undefined ? updates.is_active : true,
      created_at: updatedCust.created_at,
    };

    return NextResponse.json({
      success: true,
      staff: resultStaff,
      message: 'Staff member updated successfully.',
    });
  } catch (err: unknown) {
    console.error('Staff PATCH API exception:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyApiAuth(['admin'], request);
  if (auth.errorResponse) return auth.errorResponse;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Staff ID is required.' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();

    const { data: customer, error: fetchErr } = await supabase
      .from('customers')
      .select('id, auth_id, email')
      .eq('id', id)
      .single();

    if (fetchErr || !customer) {
      return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 });
    }

    const isPrimaryAdmin =
      customer.email?.toLowerCase().trim() === 'admin@firstelevencleaners.com' ||
      customer.email?.toLowerCase().trim() === 'admin@firsteleven.com';

    if (isPrimaryAdmin) {
      return NextResponse.json(
        { error: 'Primary Administrator account cannot be deleted.' },
        { status: 400 }
      );
    }

    // Ban auth account so they can never log in
    if (customer.auth_id) {
      await supabase.auth.admin.updateUserById(customer.auth_id, {
        ban_duration: '876000h',
        user_metadata: { is_active: false },
      });
    }

    // Set role to customer or remove
    await supabase
      .from('customers')
      .update({ role: 'customer' })
      .eq('id', id);

    return NextResponse.json({
      success: true,
      message: 'Staff member access removed successfully.',
    });
  } catch (err: unknown) {
    console.error('Staff DELETE API exception:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
