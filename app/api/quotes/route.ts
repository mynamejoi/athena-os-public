import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { SINGLE_USER_ID } from '@/lib/constants';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
        .from('quotes')
        .select('id, text, author, created_at')
        .eq('user_id', SINGLE_USER_ID)
        .order('created_at', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quotes: data || [] });
}

export async function POST(request: Request) {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { text, author } = await request.json();

    if (!text || !author) {
        return NextResponse.json({ error: 'Text and author are required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('quotes')
        .insert({ user_id: SINGLE_USER_ID, text, author })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ quote: data });
}
