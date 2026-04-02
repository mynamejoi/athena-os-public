import { createClient } from '@supabase/supabase-js';

type ConfigKey =
  | 'AUTH_PASSPHRASE_HASH'
  | 'ANTHROPIC_API_KEY'
  | 'AUTH_JWT_SECRET'
  | 'WHOOP_CLIENT_ID'
  | 'WHOOP_CLIENT_SECRET'
  | 'RESEND_API_KEY'
  | 'NOTIFICATION_EMAIL'
  | 'REPORT_TRIGGER_TIMES'
  | 'SETUP_COMPLETE';

// In-memory cache with TTL
const cache = new Map<string, { value: string; expires: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function getAppConfig(key: ConfigKey): Promise<string | undefined> {
  // 1. Env always wins
  const envVal = process.env[key];
  if (envVal) return envVal;

  // 2. Check in-memory cache
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expires) {
    return cached.value;
  }

  // 3. Query app_config table
  try {
    const supabase = getServiceClient();
    if (!supabase) return undefined;

    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) return undefined;

    cache.set(key, { value: data.value, expires: Date.now() + CACHE_TTL_MS });
    return data.value;
  } catch {
    // Table missing, connection fail, etc. — graceful fallback
    return undefined;
  }
}

export async function setAppConfig(key: ConfigKey, value: string): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) throw new Error('Service role client not available');

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) throw new Error(`Failed to save config: ${error.message}`);

  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

export async function isSetupComplete(): Promise<boolean> {
  // If env vars are set, this is a legacy user — setup is implicitly complete
  if (process.env.AUTH_PASSPHRASE_HASH) return true;

  // Check DB
  const setupFlag = await getAppConfig('SETUP_COMPLETE');
  return setupFlag === 'true';
}

export function clearConfigCache(): void {
  cache.clear();
}

export async function getAppConfigJSON<T>(key: ConfigKey): Promise<T | undefined> {
  const raw = await getAppConfig(key);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export async function setAppConfigJSON(key: ConfigKey, value: unknown): Promise<void> {
  await setAppConfig(key, JSON.stringify(value));
}
