
import { jwtVerify } from 'jose'
import { type NextRequest, NextResponse } from 'next/server'

// Exact-match sets for public paths (no startsWith to prevent path traversal)
const PUBLIC_PASSTHROUGH = new Set(['/api/auth/verify', '/api/auth/logout']);

// API routes that can be called internally (server-to-server) without auth cookie
const INTERNAL_API_ROUTES = new Set([
    '/api/whoop/sync',
    '/api/reports',
    '/api/productivity/workouts/weekly-plan',
    '/api/productivity/workouts/coach',
    '/api/productivity/streaks',
    '/api/productivity/baselines',
    '/api/productivity/auto-complete',
    '/api/productivity/habit-insights',
    '/api/planner',
    '/api/whoop/status',
    '/api/productivity/daily-trigger',
    '/api/orchestrate',
]);
const PUBLIC_LOGIN = '/login';

// Module-level cache for JWT secret (survives across requests in the same serverless instance)
let cachedJwtSecret: string | null = null;

async function getJwtSecret(): Promise<string | null> {
    // Check process.env first (set by .env.local or instrumentation.ts)
    if (process.env.AUTH_JWT_SECRET) return process.env.AUTH_JWT_SECRET;
    // Return cached value if already fetched from DB
    if (cachedJwtSecret) return cachedJwtSecret;
    // Fetch from app_config DB table
    try {
        const { getAppConfig } = await import('@/lib/app-config');
        cachedJwtSecret = await getAppConfig('AUTH_JWT_SECRET') ?? null;
        return cachedJwtSecret;
    } catch {
        return null;
    }
}

function normalizePath(pathname: string): string {
    // Strip trailing slash for consistent matching (preserve root "/")
    return pathname.length > 1 && pathname.endsWith('/')
        ? pathname.slice(0, -1)
        : pathname;
}

async function verifyAuthSession(request: NextRequest): Promise<boolean> {
    const jwtSecret = await getJwtSecret();
    if (!jwtSecret) return true; // Genuinely not configured (fresh install)

    const token = request.cookies.get('athena_session')?.value;
    if (!token) return false;

    try {
        const secret = new TextEncoder().encode(jwtSecret);
        await jwtVerify(token, secret);
        return true;
    } catch {
        return false;
    }
}

export async function updateSession(request: NextRequest) {
    const pathname = normalizePath(request.nextUrl.pathname);

    // Setup and login paths — always accessible without auth
    if (pathname === '/setup' || pathname === '/login' || pathname.startsWith('/api/setup/') || pathname === '/api/auth/verify') {
        return NextResponse.next();
    }

    // Fresh install detection — no auth configured, redirect to setup
    // Skip this check if user has a session cookie (setup was completed, env vars are in DB not .env)
    const hasSessionCookie = !!request.cookies.get('athena_session')?.value;
    if (!process.env.AUTH_JWT_SECRET && !process.env.AUTH_PASSPHRASE_HASH && !hasSessionCookie) {
        // Check app_config via a quick fetch to our own status endpoint
        try {
            const statusUrl = new URL('/api/setup/status', request.url);
            const statusRes = await fetch(statusUrl, { headers: { 'x-internal': '1' } });
            const statusData = await statusRes.json();
            if (!statusData.complete) {
                if (!pathname.startsWith('/api/')) {
                    return NextResponse.redirect(new URL('/setup', request.url));
                }
                return NextResponse.json({ error: 'Setup required' }, { status: 503 });
            }
            // Setup is complete in DB but env vars aren't set — allow through
            // The auth/verify route reads from app_config directly
        } catch {
            // Can't check status — allow through rather than blocking
        }
    }

    // Public auth paths — pass through immediately (exact match only)
    if (PUBLIC_PASSTHROUGH.has(pathname)) {
        return NextResponse.next();
    }

    // Internal API routes — allow if authenticated OR if called server-side (no origin header)
    const isInternalRoute = INTERNAL_API_ROUTES.has(pathname) ||
        [...INTERNAL_API_ROUTES].some(route => pathname.startsWith(route + '/'));
    if (isInternalRoute) {
        const isAuthenticated = await verifyAuthSession(request);
        const isInternalCall = !request.headers.get('origin');
        if (isAuthenticated || isInternalCall) {
            return NextResponse.next();
        }
    }

    // If authenticated user visits /login, redirect to home
    if (pathname === PUBLIC_LOGIN) {
        const isAuthenticated = await verifyAuthSession(request);
        if (isAuthenticated) {
            return NextResponse.redirect(new URL('/', request.url));
        }
        return NextResponse.next();
    }

    // All other paths require auth
    const isAuthenticated = await verifyAuthSession(request);

    if (!isAuthenticated) {
        if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return NextResponse.next();
}
