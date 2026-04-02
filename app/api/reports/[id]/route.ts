import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SINGLE_USER_ID } from '@/lib/constants';

function getSupabase() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    return createClient(supabaseUrl, serviceKey);
}

// ─── GET: Fetch single report ────────────────────────────────────────────────

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = getSupabase();
        const { id } = await params;

        const { data, error } = await supabase
            .from('ai_reports')
            .select('*')
            .eq('id', id)
            .eq('user_id', SINGLE_USER_ID)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Report not found' }, { status: 404 });
            }
            throw error;
        }

        return NextResponse.json({ report: data });
    } catch (e: any) {
        console.error('Report GET error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}

// ─── DELETE: Delete a report ─────────────────────────────────────────────────

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = getSupabase();
        const { id } = await params;

        const { error } = await supabase
            .from('ai_reports')
            .delete()
            .eq('id', id)
            .eq('user_id', SINGLE_USER_ID);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Report DELETE error:', e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
