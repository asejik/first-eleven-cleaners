import type { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/error-reporting';

/**
 * Append-only admin audit trail (P03 PR-24). Every admin action that changes an order's
 * stage, money or a claim is written to admin_audit_logs with who did it. The table rejects
 * updates and deletes at the database level (migration 20261005_admin_audit_immutable).
 * A failed write never blocks the action, but it does alert an admin.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

export interface AuditActor {
  id?: string | null;
  email?: string | null;
}

export async function recordAdminAction(
  supabase: AdminClient,
  {
    actor,
    action,
    targetType,
    targetId,
    details = {},
    ip,
  }: {
    actor: AuditActor | null | undefined;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, unknown>;
    ip?: string | null;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from('admin_audit_logs').insert({
      admin_id: actor?.id || null,
      admin_email: actor?.email || 'unknown',
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: ip || null,
    });
    if (error) throw error;
  } catch (err) {
    reportError('audit/admin-action', err, { alert: true, details: `Could not record ${action} on ${targetType} ${targetId}` });
  }
}
