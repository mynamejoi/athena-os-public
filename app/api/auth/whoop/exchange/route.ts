
import { exchangeWhoopCode } from '@/lib/whoop';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function POST(request: Request) {
    try {
        const { code } = await request.json();

        if (!code) {
            return NextResponse.json({ error: 'Missing code' }, { status: 400 });
        }

        // Verify Env Vars
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            console.error('[Whoop Exchange] Missing Supabase Service Credentials');
            throw new Error('Server misconfiguration: Missing DB credentials');
        }

        // Use Service Role to bypass all RLS/Auth checks
        const supabase = createClient(supabaseUrl, serviceKey);

        // Single User Mode

        // Exchange code for tokens
        const tokens = await exchangeWhoopCode(code);
        // Store tokens in Supabase
        const { error: dbError } = await supabase.from('whoop_tokens').upsert({
            user_id: SINGLE_USER_ID,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_at: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
            updated_at: new Date().toISOString()
        });

        if (dbError) {
            console.error('[Whoop Exchange] DB Upsert Error:', dbError);
            throw dbError;
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('[Whoop Exchange] Error:', error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
