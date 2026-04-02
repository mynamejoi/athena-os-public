import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null;

async function resolveApiKey(): Promise<string | undefined> {
    // 1. Check env var directly
    if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;

    // 2. Fall back to app_config table (for setup wizard users)
    try {
        const { getAppConfig } = await import('./app-config');
        return await getAppConfig('ANTHROPIC_API_KEY') ?? undefined;
    } catch {
        return undefined;
    }
}

export async function getAnthropic(): Promise<Anthropic> {
    if (_client) return _client;

    const apiKey = await resolveApiKey();

    if (!apiKey) {
        throw new Error('Anthropic API key not configured. Complete setup at /setup.');
    }

    _client = new Anthropic({ apiKey });
    return _client;
}

export function resetAnthropicClient() {
    _client = null;
}

// Backward compat: lazy module-level export
// Uses a Proxy so it initializes on first access, not at import time
export const anthropic = new Proxy({} as Anthropic, {
    get(_target, prop) {
        if (!_client) {
            const key = process.env.ANTHROPIC_API_KEY;
            if (key) {
                _client = new Anthropic({ apiKey: key });
            }
        }
        if (!_client) throw new Error('Anthropic API key not configured.');
        return (_client as any)[prop];
    }
});
