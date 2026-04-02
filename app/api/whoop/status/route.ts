import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const [tokensResult, latestDataResult] = await Promise.all([
      supabase.from('whoop_tokens').select('expires_at, updated_at').limit(1).single(),
      supabase.from('whoop_data').select('date, updated_at').order('date', { ascending: false }).limit(1).single(),
    ]);

    const tokens = tokensResult.data;

    if (tokens) {
      return NextResponse.json({
        connected: true,
        lastSync: latestDataResult.data?.updated_at || tokens.updated_at,
        tokenExpiry: tokens.expires_at,
        isExpired: new Date(tokens.expires_at) < new Date(),
      });
    }

    return NextResponse.json({
      connected: false,
      lastSync: null,
      tokenExpiry: null,
      isExpired: false,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
