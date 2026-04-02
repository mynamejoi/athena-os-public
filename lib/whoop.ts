
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

// Helper to get fresh env vars
function getWhoopConfig() {
    const clientId = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET || process.env.WHOOP_SECRET_KEY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = `${appUrl}/api/auth/whoop/callback`;

    return { clientId, clientSecret, redirectUri };
}

export async function initiateWhoopAuth() {
    const { clientId, redirectUri } = getWhoopConfig();

    if (!clientId) {
        // Debugging: Log what IS available (scrubbed)
        const envKeys = Object.keys(process.env);
        console.error('[Whoop Auth] Missing CLIENT_ID. Available Env Keys:', envKeys.filter(k => k.startsWith('WHOOP') || k.startsWith('NEXT')));
        throw new Error('Missing WHOOP_CLIENT_ID');
    }

    const state = crypto.randomUUID();

    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        state,
    });

    // Manually append scope to ensure spaces are encoded as %20, not +
    const scopes = 'offline read:recovery read:cycles read:sleep read:profile read:body_measurement read:workout';
    const scopeParam = `&scope=${encodeURIComponent(scopes)}`;

    return `${WHOOP_AUTH_URL}?${params.toString()}${scopeParam}`;
}

export async function exchangeWhoopCode(code: string) {
    const { clientId, clientSecret, redirectUri } = getWhoopConfig();

    if (!clientId || !clientSecret) throw new Error('Missing WHOOP credentials');

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
    });

    const res = await fetch(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const err = await res.text();
        console.error('Whoop Token Exchange Failed:', err);
        throw new Error('Failed to exchange token');
    }

    return res.json();
}

export async function refreshWhoopToken(refreshToken: string) {
    const { clientId, clientSecret } = getWhoopConfig();

    if (!clientId || !clientSecret) throw new Error('Missing WHOOP credentials');

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'offline read:recovery read:cycles read:sleep read:profile read:body_measurement read:workout',
    });

    const res = await fetch(WHOOP_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        throw new Error('Failed to refresh token');
    }

    return res.json();
}

export async function fetchWhoopData(accessToken: string, endpoint: string) {
    let url = endpoint;
    if (!endpoint.startsWith('http')) {
        if (endpoint.startsWith('/v2')) {
            url = `https://api.prod.whoop.com/developer${endpoint}`;
        } else {
            url = `https://api.prod.whoop.com/developer/v1${endpoint}`;
        }
    }

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) throw new Error(`Whoop API Error: ${res.status} ${res.statusText} (${url})`);
    return res.json();
}
