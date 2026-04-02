export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getAppConfig } = await import('./lib/app-config');

    const keys = ['AUTH_JWT_SECRET', 'AUTH_PASSPHRASE_HASH', 'ANTHROPIC_API_KEY'] as const;
    for (const key of keys) {
      if (!process.env[key]) {
        const val = await getAppConfig(key);
        if (val) process.env[key] = val;
      }
    }
  }
}
