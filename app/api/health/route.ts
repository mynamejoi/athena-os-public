
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        // Check Supabase connectivity via app_config table
        const { error: supabaseError } = await supabase.from('app_config').select('key').limit(1);

        let supabaseStatus = 'ok';
        if (supabaseError && supabaseError.code !== '42P01') {
            supabaseStatus = `error: ${supabaseError.message}`;
        }

        // Check Environment Variables for AI
        const envChecks = {
            anthropic: !!process.env.ANTHROPIC_API_KEY,
            gemini: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        };

        return NextResponse.json({
            supabase: supabaseStatus,
            ai_keys: envChecks,
            timestamp: new Date().toISOString()
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
