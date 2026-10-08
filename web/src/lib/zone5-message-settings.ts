import { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/error-reporting';
import type { Json } from '@/types/database';
import { mergeZone5Messages, ZONE5_MESSAGE_DEFAULTS, type Zone5Messages } from '@/lib/zone5-messages';

/**
 * The Zone 5 texts as Mission Control saved them (app_settings key 'zone5_messages'), over
 * the client's defaults in lib/zone5-messages.ts. Server only; read through a one-minute cache
 * like the coverage settings.
 */
const SETTINGS_KEY = 'zone5_messages';
const CACHE_MS = 60_000;
let cache: { at: number; messages: Zone5Messages } | null = null;

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function getZone5Messages(): Promise<Zone5Messages> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.messages;
  let messages = ZONE5_MESSAGE_DEFAULTS;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      messages = mergeZone5Messages(data?.value);
    } catch (err) {
      reportError('zone5-messages', err, { details: 'Could not read the Zone 5 messages; using the defaults' });
    }
  }
  cache = { at: Date.now(), messages };
  return messages;
}

/** Clears the cache (after a save, and in tests). */
export function resetZone5MessagesCache(): void {
  cache = null;
}

export async function saveZone5Messages(messages: Zone5Messages, updatedBy: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: messages as unknown as Json, updated_at: new Date().toISOString(), updated_by: updatedBy });
  if (error) throw error;
  cache = { at: Date.now(), messages };
}
