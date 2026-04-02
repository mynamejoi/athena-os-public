import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import rateLimit from '@/lib/rate-limit';

const authLimiter = rateLimit({ limit: 5, windowMs: 15 * 60 * 1000 }); // 5 attempts per 15 minutes

export async function POST(request: NextRequest) {
  const rateLimitResponse = authLimiter(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { passphrase } = await request.json();

    if (!passphrase) {
      return NextResponse.json({ error: 'Passphrase required' }, { status: 400 });
    }

    const { getAppConfig } = await import('@/lib/app-config');
    const hashB64 = await getAppConfig('AUTH_PASSPHRASE_HASH');
    const jwtSecret = await getAppConfig('AUTH_JWT_SECRET');
    const hash = hashB64 ? Buffer.from(hashB64, 'base64').toString('utf-8') : undefined;

    if (!hashB64 || !hash || !jwtSecret) {
      return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
    }

    const valid = await bcrypt.compare(passphrase, hash);
    if (!valid) {
      return NextResponse.json({ error: 'Invalid passphrase' }, { status: 401 });
    }

    // Create JWT with 7-day expiry
    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    const response = NextResponse.json({ success: true });
    response.cookies.set('athena_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
