import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { setAppConfig, clearConfigCache, isSetupComplete } from '@/lib/app-config';

export async function POST(request: NextRequest) {
  try {
    // Block if setup is already complete
    const complete = await isSetupComplete();
    if (complete) {
      return NextResponse.json(
        { success: false, error: 'Setup already completed' },
        { status: 403 }
      );
    }

    const { passphrase, anthropicKey, whoopClientId, whoopClientSecret, resendApiKey, notificationEmail } =
      await request.json();

    if (!passphrase || typeof passphrase !== 'string' || passphrase.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Passphrase must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Hash passphrase and encode as base64
    const hash = await bcrypt.hash(passphrase, 12);
    const hashB64 = Buffer.from(hash).toString('base64');

    // Generate JWT secret
    const jwtSecret = crypto.randomBytes(32).toString('hex');

    // Save to app_config
    await setAppConfig('AUTH_PASSPHRASE_HASH', hashB64);
    await setAppConfig('AUTH_JWT_SECRET', jwtSecret);

    if (anthropicKey) {
      await setAppConfig('ANTHROPIC_API_KEY', anthropicKey);
    }
    if (whoopClientId) {
      await setAppConfig('WHOOP_CLIENT_ID', whoopClientId);
    }
    if (whoopClientSecret) {
      await setAppConfig('WHOOP_CLIENT_SECRET', whoopClientSecret);
    }
    if (resendApiKey) {
      await setAppConfig('RESEND_API_KEY', resendApiKey);
    }
    if (notificationEmail) {
      await setAppConfig('NOTIFICATION_EMAIL', notificationEmail);
    }

    await setAppConfig('SETUP_COMPLETE', 'true');

    // Inject into process.env for current server process
    process.env.AUTH_PASSPHRASE_HASH = hashB64;
    process.env.AUTH_JWT_SECRET = jwtSecret;
    if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;
    if (whoopClientId) process.env.WHOOP_CLIENT_ID = whoopClientId;
    if (whoopClientSecret) process.env.WHOOP_CLIENT_SECRET = whoopClientSecret;

    // Clear caches so subsequent requests pick up new values
    clearConfigCache();
    const { resetAnthropicClient } = await import('@/lib/claude');
    resetAnthropicClient();

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Setup failed';
    console.error('Setup save error:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
